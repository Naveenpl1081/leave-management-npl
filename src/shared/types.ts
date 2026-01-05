
export enum LeaveStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
  }
  

  export interface LeaveRequest {
    leaveId: string;
    userId: string;
    userName: string;
    userEmail: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: LeaveStatus;
    approverId?: string;
    approverEmail?: string;
    createdAt: string;
    updatedAt?: string;
  }
  
 
  export interface User {
    userId: string;
    email: string;
    name: string;
    role: 'employee' | 'approver';
  }
  

  export interface JWTPayload {
    userId: string;
    email: string;
    name: string;
    role: 'employee' | 'approver';
    iat?: number;
    exp?: number;
  }
  

  export interface APIResponse {
    statusCode: number;
    headers: {
      'Content-Type': string;
      'Access-Control-Allow-Origin': string;
    };
    body: string;
  }
  

  export interface LeaveTableItem {
    PK: string;        
    SK: string;       
    leaveId: string;
    userId: string;
    userName: string;
    userEmail: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: LeaveStatus;
    approverId?: string;
    approverEmail?: string;
    createdAt: string;
    updatedAt?: string;
  }