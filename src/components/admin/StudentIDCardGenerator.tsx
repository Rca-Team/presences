import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryLabel } from '@/constants/schoolConfig';
import { 
  CreditCard, 
  Download, 
  Loader2, 
  User, 
  X,
  FileDown,
  Users,
  Eye
} from 'lucide-react';

interface StudentData {
  id: string;
  name: string;
  employee_id: string;
  roll_number: string;
  category: string;
  blood_group: string;
  parent_phone: string;
  parent_name: string;
  transport_mode: string;
  avatar_url?: string;
  address?: string;
}

interface StudentIDCardGeneratorProps {
  students?: StudentData[];
}

const SCHOOL_NAME = 'Presences Smart School';
const SCHOOL_TAGLINE = 'Excellence in Education';
const SCHOOL_ADDRESS = 'Smart Campus, Education City';
const ACADEMIC_YEAR = '2025–2026';

const StudentIDCardGenerator: React.FC<StudentIDCardGeneratorProps> = ({ students: propStudents }) => {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentData[]>(propStudents || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewStudent, setPreviewStudent] = useState<StudentData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, category, image_url')
        .eq('status', 'registered');

      if (error) throw error;

      const uniqueStudents = new Map<string, StudentData>();
      
      data?.forEach(record => {
        const deviceInfo = record.device_info as any;
        const metadata = deviceInfo?.metadata;
        
        if (metadata?.name && metadata.name !== 'Unknown') {
          const userId = record.user_id || record.id;
          if (!uniqueStudents.has(userId)) {
            const imageUrl = record.image_url || metadata.firebase_image_url;
            let fullImageUrl = '';
            if (imageUrl) {
              if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
                fullImageUrl = imageUrl;
              } else {
                fullImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${imageUrl}`;
              }
            }

            uniqueStudents.set(userId, {
              id: userId,
              name: metadata.name,
              employee_id: metadata.employee_id || 'N/A',
              roll_number: metadata.roll_number || metadata.employee_id || 'N/A',
              category: record.category || 'General',
              blood_group: metadata.blood_group || '—',
              parent_phone: metadata.parent_phone || '—',
              parent_name: metadata.parent_name || '—',
              transport_mode: metadata.transport_mode || '—',
              avatar_url: fullImageUrl,
              address: metadata.address || '',
            });
          }
        }
      });

      setStudents(Array.from(uniqueStudents.values()));
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({ title: 'Error', description: 'Failed to fetch student data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!propStudents) fetchStudents();
  }, [propStudents]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(students.map(s => s.id)));
  };

  const buildCardHTML = (student: StudentData, qrBase64: string) => {
    const classLabel = getCategoryLabel(student.category);
    
    return `
      <div style="
        width: 350px;
        height: 560px;
        border-radius: 16px;
        overflow: hidden;
        font-family: 'Segoe UI', 'Inter', sans-serif;
        color: #1a1a2e;
        position: relative;
        background: #ffffff;
        box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      ">
        <!-- Top Header Band -->
        <div style="
          background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
          padding: 14px 16px 12px;
          text-align: center;
          position: relative;
        ">
          <div style="
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px);
          "></div>
          <div style="position: relative; z-index: 1;">
            <div style="font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
              ${SCHOOL_NAME}
            </div>
            <div style="font-size: 10px; color: #93c5fd; margin-top: 2px; letter-spacing: 1.5px; text-transform: uppercase;">
              ${SCHOOL_TAGLINE}
            </div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 3px;">${SCHOOL_ADDRESS}</div>
          </div>
        </div>

        <!-- Accent Stripe -->
        <div style="height: 4px; background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6, #3b82f6);"></div>

        <!-- Student Photo Section -->
        <div style="display: flex; align-items: center; padding: 14px 16px 10px; gap: 14px;">
          <div style="
            width: 90px; height: 100px; flex-shrink: 0;
            border-radius: 8px; overflow: hidden;
            border: 3px solid #1e3a5f;
            background: #f1f5f9;
          ">
            ${student.avatar_url 
              ? `<img src="${student.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous" />`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:36px;">👤</div>`
            }
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 18px; font-weight: 800; color: #1e3a5f; line-height: 1.2; margin-bottom: 4px;">
              ${student.name}
            </div>
            <div style="
              display: inline-block; background: #1e3a5f; color: #ffffff;
              padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;
              letter-spacing: 0.5px;
            ">${classLabel}</div>
            <div style="margin-top: 6px; font-size: 11px; color: #64748b;">
              Academic Year: <strong style="color: #1e3a5f;">${ACADEMIC_YEAR}</strong>
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div style="padding: 0 16px; margin-top: 4px;">
          <div style="
            background: #f8fafc; border-radius: 10px; padding: 12px;
            border: 1px solid #e2e8f0;
          ">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b; width: 40%;">Roll No.</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #1e3a5f;">: ${student.roll_number}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Student ID</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${student.employee_id}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Blood Group</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #dc2626;">: ${student.blood_group}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Parent/Guardian</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${student.parent_name}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Contact No.</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${student.parent_phone}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b;">Transport</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #1e3a5f;">: ${student.transport_mode}</td>
              </tr>
              ${student.address && student.address !== '—' ? `
              <tr>
                <td style="padding: 5px 0; font-size: 11px; color: #64748b; vertical-align: top;">Address</td>
                <td style="padding: 5px 0; font-size: 11px; font-weight: 600; color: #1e3a5f; line-height: 1.4;">: ${student.address}</td>
              </tr>` : ''}
            </table>
          </div>
        </div>

        <!-- QR Code + Footer -->
        <div style="
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px 0;
          margin-top: 8px;
        ">
          <div style="
            background: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px;
            padding: 6px; width: 72px; height: 72px;
          ">
            <img src="data:image/svg+xml;base64,${qrBase64}" style="width: 100%; height: 100%;" />
          </div>
          <div style="flex: 1; text-align: right; padding-left: 12px;">
            <div style="font-size: 9px; color: #94a3b8; margin-bottom: 4px;">Scan for attendance</div>
            <div style="font-size: 9px; color: #94a3b8; line-height: 1.4;">
              This card is the property of the school.<br/>
              If found, please return to the school office.
            </div>
          </div>
        </div>

        <!-- Bottom Band -->
        <div style="
          margin-top: auto; position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
          padding: 8px 16px; text-align: center;
          font-size: 9px; color: #93c5fd; letter-spacing: 0.5px;
        ">
          Powered by Presences AI • Smart Attendance System
        </div>
      </div>
    `;
  };

  const generateIDCard = async (student: StudentData): Promise<string> => {
    const qrData = JSON.stringify({
      type: 'student_id',
      id: student.id,
      name: student.name,
      employee_id: student.employee_id
    });

    // Render QR code
    const tempQRDiv = document.createElement('div');
    tempQRDiv.style.position = 'absolute';
    tempQRDiv.style.left = '-9999px';
    document.body.appendChild(tempQRDiv);
    
    const { createRoot } = await import('react-dom/client');
    const qrRoot = createRoot(tempQRDiv);
    
    await new Promise<void>((resolve) => {
      qrRoot.render(
        <QRCodeSVG value={qrData} size={72} level="M" bgColor="white" fgColor="#1e3a5f" />
      );
      setTimeout(resolve, 100);
    });

    const qrSvg = tempQRDiv.querySelector('svg');
    const qrSvgString = qrSvg ? new XMLSerializer().serializeToString(qrSvg) : '';
    const qrBase64 = btoa(unescape(encodeURIComponent(qrSvgString)));

    qrRoot.unmount();
    document.body.removeChild(tempQRDiv);

    // Build card
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.innerHTML = buildCardHTML(student, qrBase64);
    document.body.appendChild(container);

    await new Promise(resolve => setTimeout(resolve, 200));

    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null
    });

    document.body.removeChild(container);
    return canvas.toDataURL('image/png');
  };

  const downloadSingleCard = async (student: StudentData) => {
    setIsGenerating(true);
    try {
      const dataUrl = await generateIDCard(student);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ID_Card_${student.name.replace(/\s+/g, '_')}.png`;
      link.click();
      toast({ title: 'Downloaded', description: `ID card for ${student.name} downloaded` });
    } catch (error) {
      console.error('Error generating ID card:', error);
      toast({ title: 'Error', description: 'Failed to generate ID card', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadSelectedCards = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'No Selection', description: 'Please select students first', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    const selectedStudents = students.filter(s => selectedIds.has(s.id));
    try {
      for (const student of selectedStudents) {
        await downloadSingleCard(student);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      toast({ title: 'Complete', description: `Downloaded ${selectedStudents.length} ID cards` });
    } catch (error) {
      console.error('Error downloading cards:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-border shadow-lg overflow-hidden">
      <CardHeader className="pb-4 border-b bg-gradient-to-r from-[#1e3a5f] to-[#0d2137]">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg">School ID Card Generator</span>
            <p className="text-sm font-normal text-white/60">Professional ID cards with QR codes</p>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No registered students found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.size === students.length}
                  onCheckedChange={selectAll}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({students.length})
                </label>
              </div>
              
              <Button
                onClick={downloadSelectedCards}
                disabled={selectedIds.size === 0 || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                ) : (
                  <><FileDown className="w-4 h-4 mr-2" />Download Selected ({selectedIds.size})</>
                )}
              </Button>
            </div>

            {/* Student Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((student) => (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedIds.has(student.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => toggleSelect(student.id)}
                >
                  <div className="absolute top-3 right-3">
                    <Checkbox
                      checked={selectedIds.has(student.id)}
                      onCheckedChange={() => toggleSelect(student.id)}
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg border-2 border-primary/30 overflow-hidden bg-muted flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} className="w-full h-full object-cover" alt={student.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.employee_id}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(student.category)}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setPreviewStudent(student); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); downloadSingleCard(student); }}
                        disabled={isGenerating}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Preview Modal - rendered via portal to escape overflow/scroll containers */}
      {createPortal(
        <AnimatePresence>
          {previewStudent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 overflow-y-auto"
              style={{ margin: 0 }}
              onClick={() => setPreviewStudent(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="relative my-auto w-[310px] sm:w-[350px] max-w-[95vw]"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute -top-10 right-0 text-white hover:bg-white/10 z-10"
                  onClick={() => setPreviewStudent(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
                
                {/* Live Preview Card */}
                <div
                  ref={cardRef}
                  className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white text-[#1a1a2e]"
                >
                  {/* Header */}
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0d2137] p-3 text-center relative">
                    <div className="absolute inset-0 opacity-10" style={{
                      background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 1px, transparent 1px, transparent 8px)'
                    }} />
                    <div className="relative z-10">
                      <p className="text-white font-extrabold text-sm sm:text-base tracking-wider uppercase">{SCHOOL_NAME}</p>
                      <p className="text-blue-300 text-[9px] sm:text-[10px] tracking-widest uppercase mt-0.5">{SCHOOL_TAGLINE}</p>
                      <p className="text-slate-400 text-[8px] sm:text-[9px] mt-1">{SCHOOL_ADDRESS}</p>
                    </div>
                  </div>

                  {/* Accent Stripe */}
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-red-500 via-purple-500 to-blue-500" />

                  {/* Photo + Name */}
                  <div className="flex items-center gap-3 px-3 sm:px-4 pt-3 pb-2">
                    <div className="w-[75px] h-[88px] sm:w-[90px] sm:h-[100px] flex-shrink-0 rounded-lg overflow-hidden border-[3px] border-[#1e3a5f] bg-slate-100">
                      {previewStudent.avatar_url ? (
                        <img src={previewStudent.avatar_url} className="w-full h-full object-cover" alt={previewStudent.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300">👤</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base sm:text-lg font-extrabold text-[#1e3a5f] leading-tight truncate">{previewStudent.name}</p>
                      <span className="inline-block mt-1 bg-[#1e3a5f] text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded">
                        {getCategoryLabel(previewStudent.category)}
                      </span>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
                        Academic Year: <strong className="text-[#1e3a5f]">{ACADEMIC_YEAR}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="px-3 sm:px-4 mt-1">
                    <div className="bg-slate-50 rounded-lg p-2.5 sm:p-3 border border-slate-200 text-[11px] sm:text-[12px]">
                      {[
                        ['Roll No.', previewStudent.roll_number],
                        ['Student ID', previewStudent.employee_id],
                        ['Blood Group', previewStudent.blood_group],
                        ['Parent/Guardian', previewStudent.parent_name],
                        ['Contact No.', previewStudent.parent_phone],
                        ['Transport', previewStudent.transport_mode],
                      ].map(([label, value], i) => (
                        <div key={i} className="flex py-[4px]">
                          <span className="w-[40%] text-slate-500 text-[10px] sm:text-[11px]">{label}</span>
                          <span className={`font-semibold truncate ${label === 'Blood Group' ? 'text-red-600' : 'text-[#1e3a5f]'}`}>
                            : {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* QR + Note */}
                  <div className="flex items-center justify-between px-3 sm:px-4 pt-2.5 pb-2">
                    <div className="border-2 border-slate-200 rounded-lg p-1">
                      <QRCodeSVG
                        value={JSON.stringify({
                          type: 'student_id',
                          id: previewStudent.id,
                          name: previewStudent.name,
                          employee_id: previewStudent.employee_id
                        })}
                        size={56}
                        fgColor="#1e3a5f"
                      />
                    </div>
                    <div className="flex-1 text-right pl-3">
                      <p className="text-[8px] sm:text-[9px] text-slate-400 mb-1">Scan for attendance</p>
                      <p className="text-[7px] sm:text-[8px] text-slate-400 leading-relaxed">
                        This card is the property of the school.<br />
                        If found, please return to the school office.
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0d2137] px-3 py-2 text-center">
                    <p className="text-[8px] sm:text-[9px] text-blue-300 tracking-wider">
                      Powered by Presences AI • Smart Attendance System
                    </p>
                  </div>
                </div>

                {/* Download Button */}
                <Button
                  className="w-full mt-3"
                  onClick={() => downloadSingleCard(previewStudent)}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download ID Card
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Card>
  );
};

export default StudentIDCardGenerator;
