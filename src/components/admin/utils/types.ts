
import { Dispatch, SetStateAction } from 'react';

export interface FaceInfo {
  recordId: string; // The actual database record ID
  user_id?: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  image_url?: string;
  roll_number?: string;
  blood_group?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  transport_mode?: string;
  address?: string;
}

export interface AttendanceRecord {
  id: string;
  timestamp: string;
  status: string;
  name?: string;
  image_url?: string;
}

export type SetDatesFunction = Dispatch<SetStateAction<Date[]>>;
