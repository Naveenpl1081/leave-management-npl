import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';


const sesClient = new SESClient({});

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@example.com';

interface NotifyUserInput {
  leaveRequest: {
    leaveId: string;
    userId: string;
    userName: string;
    userEmail: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
  };
  recipientEmail: string;
  emailType: 'approval_request' | 'approved' | 'rejected';
}


export const handler = async (event: NotifyUserInput): Promise<any> => {
  console.log('Notify User Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { leaveRequest, recipientEmail, emailType } = event;

   
    const emailContent = generateEmailContent(emailType, leaveRequest);

   
    const command = new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: {
          Data: emailContent.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: emailContent.htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: emailContent.textBody,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const response = await sesClient.send(command);
    console.log('Email sent successfully:', response.MessageId);

    return {
      statusCode: 200,
      body: {
        message: 'Email sent successfully',
        messageId: response.MessageId,
        recipientEmail,
      },
    };
  } catch (error: any) {
    console.error('Error sending email:', error);
    throw error;
  }
};


function generateEmailContent(
  emailType: string,
  leaveRequest: any
): { subject: string; htmlBody: string; textBody: string } {
  const { leaveId, userName, startDate, endDate, reason, status } = leaveRequest;

  switch (emailType) {
    case 'approval_request':
      return {
        subject: `Leave Approval Request - ${userName}`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #2c3e50;">Leave Approval Request</h2>
              <p>Hello,</p>
              <p><strong>${userName}</strong> has requested leave approval.</p>
              
              <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Leave ID:</strong> ${leaveId}</p>
                <p><strong>Employee:</strong> ${userName}</p>
                <p><strong>Start Date:</strong> ${startDate}</p>
                <p><strong>End Date:</strong> ${endDate}</p>
                <p><strong>Reason:</strong> ${reason}</p>
              </div>
              
              <p>Please review and approve/reject this request in the Leave Management System.</p>
              
              <p style="margin-top: 30px; font-size: 12px; color: #888;">
                This is an automated email. Please do not reply.
              </p>
            </body>
          </html>
        `,
        textBody: `
Leave Approval Request

Hello,

${userName} has requested leave approval.

Leave Details:
- Leave ID: ${leaveId}
- Employee: ${userName}
- Start Date: ${startDate}
- End Date: ${endDate}
- Reason: ${reason}

Please review and approve/reject this request in the Leave Management System.

This is an automated email. Please do not reply.
        `,
      };

    case 'approved':
      return {
        subject: `Leave Request Approved - ${leaveId}`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #27ae60;">✓ Leave Request Approved</h2>
              <p>Hello ${userName},</p>
              <p>Great news! Your leave request has been <strong style="color: #27ae60;">APPROVED</strong>.</p>
              
              <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
                <p><strong>Leave ID:</strong> ${leaveId}</p>
                <p><strong>Start Date:</strong> ${startDate}</p>
                <p><strong>End Date:</strong> ${endDate}</p>
                <p><strong>Status:</strong> <span style="color: #27ae60;">APPROVED</span></p>
              </div>
              
              <p>Enjoy your time off!</p>
              
              <p style="margin-top: 30px; font-size: 12px; color: #888;">
                This is an automated email. Please do not reply.
              </p>
            </body>
          </html>
        `,
        textBody: `
Leave Request Approved

Hello ${userName},

Great news! Your leave request has been APPROVED.

Leave Details:
- Leave ID: ${leaveId}
- Start Date: ${startDate}
- End Date: ${endDate}
- Status: APPROVED

Enjoy your time off!

This is an automated email. Please do not reply.
        `,
      };

    case 'rejected':
      return {
        subject: `Leave Request Rejected - ${leaveId}`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #e74c3c;">✗ Leave Request Rejected</h2>
              <p>Hello ${userName},</p>
              <p>We regret to inform you that your leave request has been <strong style="color: #e74c3c;">REJECTED</strong>.</p>
              
              <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #e74c3c;">
                <p><strong>Leave ID:</strong> ${leaveId}</p>
                <p><strong>Start Date:</strong> ${startDate}</p>
                <p><strong>End Date:</strong> ${endDate}</p>
                <p><strong>Status:</strong> <span style="color: #e74c3c;">REJECTED</span></p>
              </div>
              
              <p>Please contact your manager for more details.</p>
              
              <p style="margin-top: 30px; font-size: 12px; color: #888;">
                This is an automated email. Please do not reply.
              </p>
            </body>
          </html>
        `,
        textBody: `
Leave Request Rejected

Hello ${userName},

We regret to inform you that your leave request has been REJECTED.

Leave Details:
- Leave ID: ${leaveId}
- Start Date: ${startDate}
- End Date: ${endDate}
- Status: REJECTED

Please contact your manager for more details.

This is an automated email. Please do not reply.
        `,
      };

    default:
      throw new Error(`Unknown email type: ${emailType}`);
  }
}