import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Users, Phone, Heart, Bus, MapPin, User as UserIcon, IdCard, Download, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CLASSES, SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import StudentIDCardGenerator from './StudentIDCardGenerator';
import StudentCSVImporter from './StudentCSVImporter';
import CaptureFaceDialog from './CaptureFaceDialog';

interface StudentRow {
  id: string;
  user_id: string;
  name: string;
  employee_id: string;
  roll_number: string;
  category: string;
  blood_group: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  transport_mode: string;
  address: string;
  avatar_url: string;
}

const StudentDetailsTable: React.FC = () => {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [previewStudents, setPreviewStudents] = useState<StudentRow[] | null>(null);
  const [captureFor, setCaptureFor] = useState<StudentRow | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, status, device_info, category, image_url, timestamp')
        .neq('status', 'unauthorized')
        .order('timestamp', { ascending: false });
      if (error) throw error;

      const map = new Map<string, StudentRow>();
      (data || []).forEach((r: any) => {
        const deviceInfo = r.device_info || {};
        const meta = deviceInfo?.metadata || {};
        const name = meta?.name || deviceInfo?.name || '';
        if (!name || name === 'Unknown' || name === 'User') return;
        // Stable identity: user_id first (most reliable), then employee/roll, then record id
        const key = (r.user_id || meta?.employee_id || meta?.roll_number || deviceInfo?.employee_id || r.id) as string;
        if (map.has(key)) return;

        let avatar = '';
        const imageUrl = r.image_url || meta.firebase_image_url;
        if (imageUrl) {
          if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
            avatar = imageUrl;
          } else {
            avatar = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${imageUrl}`;
          }
        }

        map.set(key, {
          id: key,
          user_id: r.user_id || key,
          name,
          employee_id: meta.employee_id || deviceInfo.employee_id || '—',
          roll_number: meta.roll_number || meta.employee_id || deviceInfo.employee_id || '—',
          category: r.category || 'A',
          blood_group: meta.blood_group || '—',
          parent_name: meta.parent_name || '—',
          parent_phone: meta.parent_phone || meta.phone || '—',
          parent_email: meta.parent_email || '—',
          transport_mode: meta.transport_mode || '—',
          address: meta.address || '—',
          avatar_url: avatar,
        });
      });

      setRows(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error('Error loading students:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const blob = `${r.name} ${r.employee_id} ${r.roll_number} ${r.parent_name} ${r.parent_phone}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (classFilter !== 'all' && !r.category.startsWith(classFilter)) return false;
      if (sectionFilter !== 'all' && !r.category.endsWith(sectionFilter)) return false;
      return true;
    });
  }, [rows, search, classFilter, sectionFilter]);

  if (previewStudents) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => setPreviewStudents(null)}>
          ← Back to Student List
        </Button>
        <StudentIDCardGenerator students={previewStudents as any} />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-cyan-50 via-blue-50 to-violet-50 dark:from-cyan-950/30 dark:via-blue-950/30 dark:to-violet-950/30">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          All Students — Full Details & ID Cards
        </CardTitle>
        <CardDescription>
          Searchable directory of every registered student. Click a row to preview / download an ID card.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, roll, ID, parent or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {CLASSES.map((c) => (
                <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>Sec {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="default"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => setPreviewStudents(filtered)}
          >
            <IdCard className="h-4 w-4 mr-1" />
            Generate ID Cards ({filtered.length})
          </Button>
          <StudentCSVImporter onImported={fetchStudents} />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{rows.length} Total</Badge>
          <Badge variant="secondary">{filtered.length} Shown</Badge>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No students match the current filters.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Roll / ID</TableHead>
                  <TableHead>Blood</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <Avatar className="h-10 w-10 border">
                          {s.avatar_url ? <AvatarImage src={s.avatar_url} alt={s.name} /> : null}
                          <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.parent_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getCategoryLabel(s.category)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>Roll: <span className="font-semibold">{s.roll_number}</span></div>
                      <div className="text-xs text-muted-foreground">ID: {s.employee_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-red-600 border-red-300">
                        <Heart className="h-3 w-3 mr-1" />
                        {s.blood_group}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{s.parent_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {s.parent_phone}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1">
                        <Bus className="h-3 w-3" />
                        {s.transport_mode}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <span className="inline-flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{s.address}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCaptureFor(s)}
                          title="Capture face for this student"
                        >
                          <Camera className="h-3.5 w-3.5 mr-1" />
                          Capture Face
                        </Button>
                        <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewStudents([s])}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        ID Card
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CaptureFaceDialog
        open={!!captureFor}
        onOpenChange={(o) => { if (!o) setCaptureFor(null); }}
        student={captureFor as any}
        onSuccess={fetchStudents}
      />
    </Card>
  );
};

export default StudentDetailsTable;