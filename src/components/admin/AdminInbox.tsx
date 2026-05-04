import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, RefreshCw, Search, Inbox, AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';

interface EmailLogItem {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

const statusVariant = (status: string) => {
  if (status === 'sent') return 'default';
  if (status === 'pending') return 'secondary';
  if (status === 'suppressed') return 'outline';
  return 'destructive';
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === 'pending') return <LoaderCircle className="w-3.5 h-3.5 animate-spin" />;
  return <AlertCircle className="w-3.5 h-3.5" />;
};

const AdminInbox: React.FC = () => {
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-email-inbox', { body: {} });
      if (error) throw error;
      setLogs((data?.logs as EmailLogItem[]) || []);
    } catch (err) {
      console.error('Error fetching email logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 10000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const dedupedLogs = useMemo(() => {
    const byMessage = new Map<string, EmailLogItem>();
    for (const row of logs) {
      const key = row.message_id || row.id;
      if (!byMessage.has(key)) byMessage.set(key, row);
    }
    return Array.from(byMessage.values());
  }, [logs]);

  const filtered = dedupedLogs.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.template_name.toLowerCase().includes(q) ||
      e.recipient_email.toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q)
    );
  });

  const liveCount = dedupedLogs.filter((e) => e.status === 'pending').length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Email Inbox (Realtime)</h2>
          {liveCount > 0 && <Badge variant="secondary" className="text-xs">{liveCount} sending</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search recipient/template/status..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">No email activity yet</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-1">
            {filtered.map((email) => (
              <div key={email.id} className="w-full text-left p-3 rounded-lg border bg-card border-border">
                <div className="flex items-start gap-3">
                  <StatusIcon status={email.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{email.recipient_email}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email.template_name}</p>
                    {email.error_message && (
                      <p className="text-xs text-destructive truncate mt-0.5">{email.error_message}</p>
                    )}
                  </div>
                  <Badge variant={statusVariant(email.status)} className="text-[10px]">
                    {email.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default AdminInbox;
