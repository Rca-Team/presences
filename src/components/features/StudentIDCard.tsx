import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Download, 
  Printer, 
  IdCard, 
  User,
  Building,
  Phone,
  Mail,
  Calendar
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';

interface StudentData {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  department?: string;
  image_url?: string;
  parent_phone?: string;
  parent_email?: string;
  created_at?: string;
}

interface StudentIDCardProps {
  student: StudentData;
  schoolName?: string;
  schoolLogo?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'A': { bg: 'bg-blue-500', text: 'text-blue-500' },
  'B': { bg: 'bg-green-500', text: 'text-green-500' },
  'C': { bg: 'bg-yellow-500', text: 'text-yellow-500' },
  'D': { bg: 'bg-orange-500', text: 'text-orange-500' },
  'Teacher': { bg: 'bg-purple-500', text: 'text-purple-500' },
};

const StudentIDCard: React.FC<StudentIDCardProps> = ({ 
  student, 
  schoolName = "Face Attendance School",
  schoolLogo 
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const categoryColor = CATEGORY_COLORS[student.category] || CATEGORY_COLORS['A'];

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      });
      
      const link = document.createElement('a');
      link.download = `ID_Card_${student.name.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error generating ID card:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!cardRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    let stylesHtml = '';
    styles.forEach(style => {
      stylesHtml += style.outerHTML;
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ID Card - ${student.name}</title>
          ${stylesHtml}
          <style>
            body { 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
              margin: 0;
              background: white;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${cardRef.current.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const qrData = JSON.stringify({
    id: student.id,
    name: student.name,
    employee_id: student.employee_id,
    category: student.category,
    timestamp: Date.now(),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5" />
            Student ID Card
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button 
              size="sm" 
              onClick={handleDownload}
              disabled={isGenerating}
            >
              <Download className="h-4 w-4 mr-1" />
              {isGenerating ? 'Generating...' : 'Download'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* ID Card Design */}
        <div 
          ref={cardRef}
          className="relative w-full max-w-sm mx-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: '1.586/1' }}
        >
          {/* Top Color Bar */}
          <div className={`absolute top-0 left-0 right-0 h-2 ${categoryColor.bg}`} />
          
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{ 
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.05) 10px, rgba(255,255,255,.05) 20px)' 
            }} />
          </div>

          {/* Content */}
          <div className="relative p-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <Building className="h-6 w-6 text-white/80" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">{schoolName}</h3>
                <p className="text-white/60 text-xs">Student Identification Card</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex gap-4 flex-1">
              {/* Photo */}
              <div className="flex flex-col items-center">
                <div className="w-20 h-24 bg-white/10 rounded-lg overflow-hidden border-2 border-white/20">
                  {student.image_url ? (
                    <img 
                      src={student.image_url.startsWith('data:') 
                        ? student.image_url 
                        : `https://zovwmlqnrsionbolcpng.supabase.co/storage/v1/object/public/face-images/${student.image_url}`
                      } 
                      alt={student.name}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-10 w-10 text-white/40" />
                    </div>
                  )}
                </div>
                <Badge className={`mt-2 ${categoryColor.bg} text-white text-xs`}>
                  {student.category === 'Teacher' ? 'Staff' : `Class ${student.category}`}
                </Badge>
              </div>

              {/* Details */}
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-white/60 text-xs">Name</p>
                  <p className="text-white font-semibold text-sm truncate">{student.name}</p>
                </div>
                <div>
                  <p className="text-white/60 text-xs">ID Number</p>
                  <p className="text-white font-mono text-sm">{student.employee_id}</p>
                </div>
                {student.department && (
                  <div>
                    <p className="text-white/60 text-xs">Department</p>
                    <p className="text-white text-sm truncate">{student.department}</p>
                  </div>
                )}
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div className="bg-white p-1.5 rounded-lg">
                  <QRCodeSVG 
                    value={qrData} 
                    size={60}
                    level="M"
                  />
                </div>
                <p className="text-white/40 text-[8px] mt-1">Scan to verify</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-auto">
              <div className="flex items-center gap-1 text-white/40 text-[10px]">
                <Calendar className="h-3 w-3" />
                Valid: {format(new Date(), 'yyyy')} - {format(new Date().setFullYear(new Date().getFullYear() + 1), 'yyyy')}
              </div>
              <p className="text-white/40 text-[10px]">Powered by Face Attendance</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentIDCard;
