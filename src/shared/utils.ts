import { APIResponse } from './types';


export const createResponse = (
  statusCode: number,
  body: any
): APIResponse => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', 
    },
    body: JSON.stringify(body),
  };
};


export const successResponse = (data: any, message?: string): APIResponse => {
  return createResponse(200, {
    success: true,
    message: message || 'Success',
    data,
  });
};


export const errorResponse = (
  statusCode: number,
  message: string,
  error?: any
): APIResponse => {
  return createResponse(statusCode, {
    success: false,
    message,
    error: error?.message || error,
  });
};


export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};


export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};


export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};


export const isValidDate = (date: string): boolean => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
};


export const isEndDateValid = (startDate: string, endDate: string): boolean => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return end >= start;
};