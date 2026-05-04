import React, { useMemo, useState } from 'react';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { DatabaseBackup, Upload, Trash2, ShieldAlert, Loader2 } from 'lucide-react';

type BackupResponse = {
  backup: unknown;
  stats?: {
    users?: number;
    tables?: number;
    storageFiles?: number;
  };
};

const DataBackup = () => {
  const { toast } = useToast();
  const { role, isLoading } = useUserRole();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [includeAuthUsers, setIncludeAuthUsers] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);

  const canRunCleanup = useMemo(() => confirmationCode.trim() === 'CLEAN MY CLOUD', [confirmationCode]);

  const downloadJsonFile = (fileName: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const { data, error } = await supabase.functions.invoke('project-backup-manager', {
        body: { action: 'export_backup' },
      });

      const typedData = data as BackupResponse | null;

      if (error || !typedData?.backup) {
        throw new Error(error?.message || 'Failed to generate backup');
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJsonFile(`project-backup-${stamp}.json`, typedData.backup);

      toast({
        title: 'Backup created',
        description: `Downloaded backup with ${typedData.stats?.users ?? 0} users and ${typedData.stats?.tables ?? 0} tables.`,
      });
    } catch (err: any) {
      toast({
        title: 'Backup failed',
        description: err?.message || 'Could not create backup file.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestore = async () => {
    if (!backupFile) {
      toast({ title: 'No file selected', description: 'Upload a backup .json file first.', variant: 'destructive' });
      return;
    }

    try {
      setIsRestoring(true);
      const raw = await backupFile.text();
      const parsed = JSON.parse(raw);

      const { error } = await supabase.functions.invoke('project-backup-manager', {
        body: { action: 'restore_backup', backup: parsed },
      });

      if (error) throw new Error(error.message);

      toast({
        title: 'Restore completed',
        description: 'Cloud data and face storage were restored from your backup file.',
      });
    } catch (err: any) {
      toast({
        title: 'Restore failed',
        description: err?.message || 'Backup file is invalid or restore failed.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCleanCloud = async () => {
    if (!canRunCleanup) {
      toast({
        title: 'Confirmation needed',
        description: 'Type CLEAN MY CLOUD to unlock full cleanup.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCleaning(true);
      const { error } = await supabase.functions.invoke('project-backup-manager', {
        body: {
          action: 'clean_cloud',
          confirmationCode,
          includeAuthUsers,
        },
      });

      if (error) throw new Error(error.message);

      toast({
        title: 'Cloud cleaned',
        description: 'All project data and face files were removed successfully.',
      });

      setBackupFile(null);
      setSelectedFileName('');
      setConfirmationCode('');
    } catch (err: any) {
      toast({
        title: 'Cleanup failed',
        description: err?.message || 'Could not clean cloud data.',
        variant: 'destructive',
      });
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <PageTransition>
        <PageLayout>
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageLayout>
      </PageTransition>
    );
  }

  if (role !== 'admin') {
    return (
      <PageTransition>
        <PageLayout>
          <div className="mx-auto max-w-xl py-10">
            <Alert variant="destructive" className="border-destructive/50">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                You are not authorized to access this developer data page.
              </AlertDescription>
            </Alert>
          </div>
        </PageLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageLayout>
        <div className="mx-auto max-w-5xl space-y-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Developer Data</h1>
              <p className="text-sm text-muted-foreground">Backup, restore, and full cloud cleanup controls.</p>
            </div>
            <Badge variant="secondary" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Admin only</Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DatabaseBackup className="h-5 w-5" /> Full Backup</CardTitle>
              <CardDescription>
                Download a full backup JSON including users, project tables, and stored face files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                {isExporting ? 'Preparing backup...' : 'Download Backup'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Restore from Backup</CardTitle>
              <CardDescription>
                Upload a previously downloaded backup JSON to restore data and face storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="backup-file">Backup file (.json)</Label>
                <Input
                  id="backup-file"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setBackupFile(file);
                    setSelectedFileName(file?.name || '');
                  }}
                />
                {selectedFileName ? <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p> : null}
              </div>
              <Button onClick={handleRestore} disabled={isRestoring || !backupFile} className="gap-2">
                {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isRestoring ? 'Restoring...' : 'Restore Backup'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Clean Whole Cloud</CardTitle>
              <CardDescription>
                Permanently delete all project data and all stored face files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  This action is destructive and cannot be undone without a backup file.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Also delete authentication users</p>
                  <p className="text-xs text-muted-foreground">Keeps your currently logged-in account safe automatically.</p>
                </div>
                <Switch checked={includeAuthUsers} onCheckedChange={setIncludeAuthUsers} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cleanup-code">Type CLEAN MY CLOUD to confirm</Label>
                <Input
                  id="cleanup-code"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="CLEAN MY CLOUD"
                />
              </div>

              <Button
                variant="destructive"
                onClick={handleCleanCloud}
                disabled={!canRunCleanup || isCleaning}
                className="gap-2"
              >
                {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isCleaning ? 'Cleaning cloud...' : 'Clean Whole Cloud'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default DataBackup;