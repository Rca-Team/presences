import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Search, User, Scissors, RefreshCw, ImageIcon, Trash2, ArrowRightLeft, ArrowLeft, UserX } from 'lucide-react';
import ImageCropper from './ImageCropper';
import { uploadImage } from '@/services/face-recognition/StorageService';
import {
  syncFromSupabase as syncDescriptorCache,
  cacheDescriptor,
  removeFromCache,
} from '@/services/face-recognition/DescriptorCacheService';

type FaceSample = {
  id: string;
  user_id: string;
  label: string | null;
  image_url: string | null;
  created_at: string;
  source: 'descriptor_registration' | 'record_registration' | 'recognition_attendance' | 'recognition_gate';
  source_table: 'face_descriptors' | 'attendance_records';
  confidence_score?: number | null;
  status?: string | null;
};

type StudentGroup = {
  userId: string;
  name: string;
  employeeId: string;
  samples: FaceSample[];
};

const isSlot = (s: FaceSample) => s.source_table === 'face_descriptors';
const FACE_SAMPLE_BUCKETS = ['face-images', 'attendance-training-faces', 'student-registration-faces'] as const;

const parseStoragePathFromUrl = (value: string, bucket: string): string | null => {
  const cleaned = value.trim();
  const pattern = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`);
  const match = cleaned.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const resolveFaceSampleUrl = async (
  rawValue: string | null | undefined,
  signedUrlCache: Map<string, string | null>
): Promise<string | null> => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  const isStorageObjectUrl = /\/storage\/v1\/object\/(?:public|sign)\//.test(value);

  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  if (/^https?:\/\//i.test(value) && !isStorageObjectUrl) {
    return value;
  }

  const candidates = new Set<{ bucket: string; path: string }>();

  FACE_SAMPLE_BUCKETS.forEach((bucket) => {
    const extracted = parseStoragePathFromUrl(value, bucket);
    if (extracted) candidates.add({ bucket, path: extracted });
  });

  if (candidates.size === 0) {
    const normalized = value.replace(/^\/+/, '');
    FACE_SAMPLE_BUCKETS.forEach((bucket) => candidates.add({ bucket, path: normalized }));
  }

  for (const candidate of candidates) {
    const cacheKey = `${candidate.bucket}:${candidate.path}`;
    if (signedUrlCache.has(cacheKey)) {
      const cached = signedUrlCache.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    const { data, error } = await supabase.storage
      .from(candidate.bucket)
      .createSignedUrl(candidate.path, 60 * 60);

    if (!error && data?.signedUrl) {
      signedUrlCache.set(cacheKey, data.signedUrl);
      return data.signedUrl;
    }

    signedUrlCache.set(cacheKey, null);
  }

  return null;
};

const StudentFaceSamplesManager: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'confidence'>('newest');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'slots' | 'captured'>('all');

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSample, setCropSample] = useState<FaceSample | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  const [transferSampleId, setTransferSampleId] = useState<string | null>(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState<string>('');
  const [deletingStudent, setDeletingStudent] = useState(false);

  const fetchSamples = async () => {
    setLoading(true);
    try {
      const [samplesRes, allAttRes, profileRes] = await Promise.all([
        supabase
          .from('face_descriptors')
          .select('id, user_id, label, image_url, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, image_url, status, device_info, timestamp, confidence_score')
          .neq('status', 'unauthorized')
          .order('timestamp', { ascending: false }),
        supabase
          .from('profiles')
          .select('user_id, display_name')
          .not('user_id', 'is', null),
      ]);

      if (samplesRes.error) throw samplesRes.error;
      if (allAttRes.error) throw allAttRes.error;
      if (profileRes.error) throw profileRes.error;

      const profileMap = new Map<string, string>();
      (profileRes.data || []).forEach((p: any) => {
        if (p?.user_id && p?.display_name) profileMap.set(p.user_id, p.display_name);
      });

      const employeeToUserId = new Map<string, string>();
      (allAttRes.data || []).forEach((r: any) => {
        const di = r.device_info || {};
        const m = di.metadata || {};
        const empKey = (m.employee_id || m.roll_number || di.employee_id || '').toString().trim();
        if (r.user_id && empKey) employeeToUserId.set(empKey, r.user_id);
      });

      // Build the student directory using the SAME logic as StudentDetailsTable so
      // every registered student (22) appears here even if their attendance rows
      // have a null user_id. The "key" is the stable identity used for grouping.
      const grouped = new Map<string, StudentGroup>();
      const userIdToKey = new Map<string, string>(); // map auth user_id → group key
      const employeeToKey = new Map<string, string>();

      const keyForRecord = (r: any): string | null => {
        const di = r.device_info || {};
        const m = di.metadata || {};
        const empId = (m.employee_id || m.roll_number || di.employee_id || '').toString().trim();
        const canonicalUserId = r.user_id || (empId ? employeeToUserId.get(empId) : null);
        // Prefer canonical user_id, then employee key, then record id
        return (canonicalUserId || empId || r.id) as string | null;
      };

      (allAttRes.data || []).forEach((r: any) => {
        const di = r.device_info || {};
        const m = di.metadata || {};
        const name = m.name || di.name || (r.user_id ? profileMap.get(r.user_id) : '') || '';
        if (!name || name === 'Unknown' || name === 'User') return;
        const key = keyForRecord(r);
        if (!key) return;
        if (!grouped.has(key)) {
          grouped.set(key, {
            userId: r.user_id || key,
            name,
            employeeId: m.employee_id || m.roll_number || di.employee_id || key,
            samples: [],
          });
          if (r.user_id) userIdToKey.set(r.user_id, key);
          const empId = m.employee_id || m.roll_number || di.employee_id;
          if (empId) employeeToKey.set(empId, key);
        } else if (r.user_id && !userIdToKey.has(r.user_id)) {
          userIdToKey.set(r.user_id, key);
        }
      });

      // Push attendance-based samples (register / recognition / gate)
      (allAttRes.data || []).forEach((r: any) => {
        if (!r.image_url) return;
        const key = keyForRecord(r);
        if (!key || !grouped.has(key)) return;
        const di = r.device_info || {};
        const fromGate = Boolean(di.gate);
        let source: FaceSample['source'];
        if (r.status === 'registered' || r.status === 'pending_approval') {
          source = 'record_registration';
        } else if ((r.confidence_score ?? 0) >= 0.6 && (r.status === 'present' || r.status === 'late')) {
          source = fromGate ? 'recognition_gate' : 'recognition_attendance';
        } else {
          return;
        }
        grouped.get(key)!.samples.push({
          id: r.id,
          user_id: r.user_id || key,
          label: di.metadata?.name || null,
          image_url: r.image_url,
          created_at: r.timestamp,
          source,
          source_table: 'attendance_records',
          confidence_score: r.confidence_score ?? null,
          status: r.status,
        });
      });

      // Push trained-slot descriptors only for students that still exist in
      // the directory (i.e., still have attendance/registration records).
      // Orphan descriptors from deleted students are skipped so they don't
      // appear here as ghost entries.
      (samplesRes.data || []).forEach((raw: any) => {
        const uid = raw.user_id as string | null;
        if (!uid) return;
        const key = userIdToKey.get(uid);
        if (!key || !grouped.has(key)) return; // student was deleted
        grouped.get(key)!.samples.push({
          id: raw.id,
          user_id: uid,
          label: raw.label,
          image_url: raw.image_url,
          created_at: raw.created_at,
          source: 'descriptor_registration',
          source_table: 'face_descriptors',
          confidence_score: 1,
          status: 'registered',
        });
      });

      const next = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
      const signedUrlCache = new Map<string, string | null>();
      const hydratedGroups = await Promise.all(
        next.map(async (group) => ({
          ...group,
          samples: await Promise.all(
            group.samples.map(async (sample) => {
              const resolved = await resolveFaceSampleUrl(sample.image_url, signedUrlCache);
              return {
                ...sample,
                image_url: resolved,
              };
            })
          ),
        }))
      );

      setGroups(hydratedGroups);
      if (!selectedUserId && hydratedGroups.length > 0) {
        setSelectedUserId(hydratedGroups[0].userId);
      }
    } catch (error) {
      console.error('Failed to fetch face samples:', error);
      toast({ title: 'Error', description: 'Could not load student face samples.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSamples();
    const channel = supabase
      .channel('face-samples-manager')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.new || {};
        try {
          if (r.descriptor && r.user_id) {
            await cacheDescriptor({
              id: r.id,
              userId: r.user_id,
              name: r.label || 'Unknown',
              descriptor: r.descriptor as number[],
              imageUrl: r.image_url,
              createdAt: new Date(r.created_at || Date.now()).getTime(),
              lastUsed: Date.now(),
            });
          } else {
            await syncDescriptorCache();
          }
          toast({ title: 'Model synced', description: `Added ${r.label || 'new descriptor'} to live model.` });
        } catch (err) {
          console.warn('Incremental cache add failed, doing full resync:', err);
          syncDescriptorCache().catch(() => {});
        }
        fetchSamples();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.old || {};
        try {
          if (r.id) await removeFromCache(r.id);
          toast({ title: 'Model synced', description: `Removed ${r.label || 'descriptor'} from live model.` });
        } catch (err) {
          console.warn('Incremental cache delete failed, doing full resync:', err);
          syncDescriptorCache().catch(() => {});
        }
        fetchSamples();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'face_descriptors' }, async (payload: any) => {
        const r = payload.new || {};
        try {
          if (r.descriptor && r.user_id) {
            await cacheDescriptor({
              id: r.id,
              userId: r.user_id,
              name: r.label || 'Unknown',
              descriptor: r.descriptor as number[],
              imageUrl: r.image_url,
              createdAt: new Date(r.created_at || Date.now()).getTime(),
              lastUsed: Date.now(),
            });
          }
          toast({ title: 'Model synced', description: 'Live model updated.' });
        } catch (err) {
          syncDescriptorCache().catch(() => {});
        }
        fetchSamples();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => fetchSamples())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchSamples())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || g.employeeId.toLowerCase().includes(q);
    });
  }, [groups, search]);

  const selectedGroup = useMemo(
    () => filteredGroups.find((g) => g.userId === selectedUserId) || null,
    [filteredGroups, selectedUserId]
  );

  const groupsMap = useMemo(() => new Map(groups.map((g) => [g.userId, g])), [groups]);

  const selectedSamples = useMemo(() => {
    if (!selectedGroup) return [];
    const list = [...selectedGroup.samples];
    if (sortBy === 'oldest') {
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    if (sortBy === 'confidence') {
      return list.sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0));
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [selectedGroup, sortBy]);

  const selectedSlots = useMemo(() => selectedSamples.filter(isSlot), [selectedSamples]);
  const selectedPhotos = useMemo(() => selectedSamples.filter((s) => !isSlot(s)), [selectedSamples]);
  const showSlots = sourceFilter === 'all' || sourceFilter === 'slots';
  const showPhotos = sourceFilter === 'all' || sourceFilter === 'captured';

  const handleDeleteSample = async (sample: FaceSample) => {
    try {
      if (sample.source_table === 'face_descriptors') {
        const { error } = await supabase.from('face_descriptors').delete().eq('id', sample.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_records')
          .update({ image_url: null })
          .eq('id', sample.id);
        if (error) throw error;
      }

      toast({ title: 'Image removed', description: 'Selected sample image was removed from model sample list.' });
      fetchSamples();
    } catch (error) {
      console.error('Failed deleting sample image:', error);
      toast({ title: 'Delete failed', description: 'Could not delete this sample image.', variant: 'destructive' });
    }
  };

  const openCropper = async (sample: FaceSample) => {
    if (!sample.image_url) {
      toast({ title: 'No image', description: 'This sample has no stored photo to edit.', variant: 'destructive' });
      return;
    }
    try {
      let src = sample.image_url;
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        const response = await fetch(src);
        const blob = await response.blob();
        src = URL.createObjectURL(blob);
      }
      setCropSample(sample);
      setCropImageSrc(src);
      setCropOpen(true);
    } catch {
      toast({ title: 'Image load failed', description: 'Could not open sample image for editing.', variant: 'destructive' });
    }
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    if (!cropSample) return;
    try {
      const folderId = (cropSample.user_id || 'unassigned')
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const file = new File([croppedBlob], `sample_${cropSample.id}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadImage(file, `students/${folderId}/${file.name}`);

      const table = cropSample.source_table;
      const { error } = await supabase
        .from(table)
        .update({ image_url: url })
        .eq('id', cropSample.id);

      if (error) throw error;

      toast({ title: 'Updated', description: 'Sample photo was cropped and saved.' });
      setCropOpen(false);
      setCropSample(null);
      setCropImageSrc('');
      fetchSamples();
    } catch (error) {
      console.error('Failed updating sample image:', error);
      toast({ title: 'Save failed', description: 'Could not save cropped photo.', variant: 'destructive' });
    }
  };

  const handleTransferSample = async (sample: FaceSample) => {
    if (!transferTargetUserId) {
      toast({ title: 'Select student', description: 'Please choose a student to transfer this photo.', variant: 'destructive' });
      return;
    }

    if (transferTargetUserId === sample.user_id) {
      toast({ title: 'Same student', description: 'Choose a different student for transfer.', variant: 'destructive' });
      return;
    }

    try {
      const target = groupsMap.get(transferTargetUserId);
      const updatePayload: Record<string, any> = { user_id: transferTargetUserId };

      if (sample.source_table === 'face_descriptors') {
        updatePayload.label = target?.name || null;
      }

      const { error } = await supabase
        .from(sample.source_table)
        .update(updatePayload)
        .eq('id', sample.id);

      if (error) throw error;

      toast({ title: 'Photo transferred', description: 'Sample photo was moved to the selected student.' });
      setTransferSampleId(null);
      setTransferTargetUserId('');
      fetchSamples();
    } catch (error) {
      console.error('Failed transferring sample image:', error);
      toast({ title: 'Transfer failed', description: 'Could not transfer this sample image.', variant: 'destructive' });
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedGroup) return;
    const confirmed = window.confirm(
      `Delete ALL face data for ${selectedGroup.name} (${selectedGroup.employeeId})?\n\nThis removes trained slots and clears all captured sample photos. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingStudent(true);
    try {
      const userIds = new Set<string>();
      const recordIds: string[] = [];
      const descriptorIds: string[] = [];
      selectedGroup.samples.forEach((s) => {
        if (s.user_id) userIds.add(s.user_id);
        if (s.source_table === 'face_descriptors') descriptorIds.push(s.id);
        else recordIds.push(s.id);
      });

      if (descriptorIds.length > 0) {
        const { error } = await supabase.from('face_descriptors').delete().in('id', descriptorIds);
        if (error) throw error;
      }
      // Also nuke any descriptors keyed by this student's user_id (covers orphans not yet shown)
      if (userIds.size > 0) {
        const { error } = await supabase
          .from('face_descriptors')
          .delete()
          .in('user_id', Array.from(userIds));
        if (error) throw error;
      }
      if (recordIds.length > 0) {
        const { error } = await supabase
          .from('attendance_records')
          .update({ image_url: null })
          .in('id', recordIds);
        if (error) throw error;
      }

      toast({
        title: 'Student data deleted',
        description: `Removed all face samples for ${selectedGroup.name}.`,
      });
      setSelectedUserId('');
      fetchSamples();
      syncDescriptorCache().catch(() => {});
    } catch (error) {
      console.error('Failed deleting student face data:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete this student\'s face data.',
        variant: 'destructive',
      });
    } finally {
      setDeletingStudent(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Face Samples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search student by name or ID..." />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'confidence')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="confidence">Sort: Confidence</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'slots' | 'captured')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Show: All sources</option>
              <option value="slots">Show: Trained Slots only</option>
              <option value="captured">Show: Captured Samples only</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchSamples}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{groups.length} Students</Badge>
            <Badge variant="secondary">{groups.reduce((sum, g) => sum + g.samples.length, 0)} Total Samples</Badge>
          </div>

          <ScrollArea className="max-h-none pr-2">
            <div className="space-y-2">
              {(selectedUserId ? filteredGroups.filter((g) => g.userId === selectedUserId) : filteredGroups).map((g) => (
                <button
                  key={g.userId}
                  onClick={() => setSelectedUserId(selectedUserId === g.userId ? '' : g.userId)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${selectedUserId === g.userId ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1"><User className="w-3.5 h-3.5" /> {g.name}</p>
                      <p className="text-xs text-muted-foreground truncate">ID: {g.employeeId}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{g.samples.length} photos</Badge>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
          {selectedUserId && (
            <Button variant="outline" size="sm" onClick={() => setSelectedUserId('')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to all students
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {selectedGroup && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedGroup.name}</p>
                <p className="text-xs text-muted-foreground truncate">ID: {selectedGroup.employeeId}</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteStudent}
                disabled={deletingStudent || selectedGroup.samples.length === 0}
              >
                <UserX className="w-4 h-4 mr-1" />
                {deletingStudent ? 'Deleting...' : 'Delete student data'}
              </Button>
            </div>
          )}
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : !selectedGroup ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              Select a student to view all model training and recognition images.
            </div>
          ) : selectedSamples.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No face samples available for this student.
            </div>
          ) : (
            (() => {
              const renderCard = (sample: FaceSample) => (
                <div key={sample.id} className="rounded-lg border p-3 bg-card">
                  <div className="aspect-square rounded-md overflow-hidden bg-muted mb-2 flex items-center justify-center">
                    {sample.image_url ? (
                      <img src={sample.image_url} alt={`${selectedGroup.name} sample`} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{selectedGroup.name}</p>
                  <p className="text-xs text-muted-foreground truncate">ID: {selectedGroup.employeeId}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {sample.source === 'descriptor_registration' && <Badge variant="default" className="text-[10px]">Model Training (Descriptors)</Badge>}
                    {sample.source === 'record_registration' && <Badge variant="outline" className="text-[10px]">Register Page</Badge>}
                    {sample.source === 'recognition_attendance' && <Badge variant="secondary" className="text-[10px]">Attendance Recognition 80%+</Badge>}
                    {sample.source === 'recognition_gate' && <Badge variant="secondary" className="text-[10px]">Gate Mode Recognition 80%+</Badge>}
                    {typeof sample.confidence_score === 'number' && (
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round(sample.confidence_score * 100)}%
                      </Badge>
                    )}
                    {sample.status && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {sample.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{new Date(sample.created_at).toLocaleString()}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openCropper(sample)} disabled={!sample.image_url}>
                      <Scissors className="w-3.5 h-3.5 mr-1" /> Edit / Crop
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => handleDeleteSample(sample)} disabled={!sample.image_url}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setTransferSampleId(sample.id);
                        setTransferTargetUserId('');
                      }}
                      disabled={groups.length < 2}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Transfer
                    </Button>
                  </div>

                  {transferSampleId === sample.id && (
                    <div className="mt-2 rounded-md border border-border p-2 space-y-2 bg-background">
                      <p className="text-xs text-muted-foreground">Transfer this photo to another student</p>
                      <select
                        value={transferTargetUserId}
                        onChange={(e) => setTransferTargetUserId(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">Select student...</option>
                        {groups
                          .filter((g) => g.userId !== sample.user_id)
                          .map((g) => (
                            <option key={g.userId} value={g.userId}>
                              {g.name} ({g.employeeId})
                            </option>
                          ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" onClick={() => handleTransferSample(sample)} disabled={!transferTargetUserId}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTransferSampleId(null);
                            setTransferTargetUserId('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
              return (
                <div className="space-y-6">
                  {showSlots && (<section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Trained Slots (Live Recognition Model)</h3>
                      <Badge variant="default" className="text-[10px]">{selectedSlots.length} slots</Badge>
                    </div>
                    {selectedSlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No trained slots — this student is not yet in the live recognition model.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedSlots.map(renderCard)}
                      </div>
                    )}
                  </section>)}
                  {showPhotos && (<section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Captured Samples (Register / Attendance / Gate)</h3>
                      <Badge variant="secondary" className="text-[10px]">{selectedPhotos.length} samples</Badge>
                    </div>
                    {selectedPhotos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No captured sample photos for this student yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedPhotos.map(renderCard)}
                      </div>
                    )}
                  </section>)}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <ImageCropper
        open={cropOpen}
        imageSrc={cropImageSrc}
        onCancel={() => {
          setCropOpen(false);
          setCropSample(null);
          setCropImageSrc('');
        }}
        onCropComplete={handleCropSave}
      />
    </div>
  );
};

export default StudentFaceSamplesManager;