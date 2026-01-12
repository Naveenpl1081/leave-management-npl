import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { randomBytes } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const sesClient = new SESClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({});

const SENDER_EMAIL = process.env.SENDER_EMAIL;
const API_ENDPOINT_PARAM = process.env.API_ENDPOINT_PARAM;
const TABLE_NAME = process.env.TABLE_NAME!;

let cachedApiEndpoint: string | null = null;

// Get API endpoint from SSM Parameter Store
const getApiEndpoint = async (): Promise<string> => {
  if (cachedApiEndpoint) return cachedApiEndpoint;

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: API_ENDPOINT_PARAM!,
    })
  );

  if (!response.Parameter?.Value) {
    throw new Error('API endpoint not found in SSM');
  }

  cachedApiEndpoint = response.Parameter.Value;
  return cachedApiEndpoint;
};

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

// Generate a secure one-time approval token
const generateApprovalToken = (): string => {
  return randomBytes(32).toString('hex');
};

// Store the approval token in DynamoDB
const storeApprovalToken = async (leaveId: string, approveToken: string, rejectToken: string) => {
  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `APPROVAL_TOKEN#${approveToken}`,
        SK: 'TOKEN',
        leaveId: leaveId,
        action: 'approve',
        expiresAt: expiresAt,
        used: false,
      },
    })
  );

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `APPROVAL_TOKEN#${rejectToken}`,
        SK: 'TOKEN',
        leaveId: leaveId,
        action: 'reject',
        expiresAt: expiresAt,
        used: false,
      },
    })
  );
};

export const handler = async (event: NotifyUserInput): Promise<any> => {
  console.log('Notify User Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { leaveRequest, recipientEmail, emailType } = event;

    let approveToken = '';
    let rejectToken = '';
    let apiEndpoint = '';

    // Generate tokens and get API endpoint only for approval request emails
    if (emailType === 'approval_request') {
      approveToken = generateApprovalToken();
      rejectToken = generateApprovalToken();
      await storeApprovalToken(leaveRequest.leaveId, approveToken, rejectToken);
      apiEndpoint = await getApiEndpoint();
    }

    const emailContent = generateEmailContent(emailType, leaveRequest, approveToken, rejectToken, apiEndpoint);

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
    
    if (error.name === 'MessageRejected') {
      console.error('Email address not verified in SES. Please verify:', error.message);
    }
    
    throw error;
  }
};

function generateEmailContent(
  emailType: string,
  leaveRequest: any,
  approveToken: string = '',
  rejectToken: string = '',
  apiEndpoint: string = ''
): { subject: string; htmlBody: string; textBody: string } {
  const { leaveId, userName, startDate, endDate, reason, status } = leaveRequest;

  switch (emailType) {
    case 'approval_request':
      const approveUrl = `${apiEndpoint}/leave/approve?token=${approveToken}`;
      const rejectUrl = `${apiEndpoint}/leave/approve?token=${rejectToken}`;

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
              
              <p>Please click one of the buttons below to approve or reject this request:</p>
              
              <div style="margin: 30px 0; text-align: center;">
                <a href="${approveUrl}" 
                   style="display: inline-block; padding: 12px 30px; margin: 10px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  ✓ APPROVE
                </a>
                <a href="${rejectUrl}" 
                   style="display: inline-block; padding: 12px 30px; margin: 10px; background-color: #e74c3c; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  ✗ REJECT
                </a>
              </div>
              
              <p style="font-size: 12px; color: #888; margin-top: 30px;">
                Note: These links will expire in 24 hours and can only be used once.
              </p>
              
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

To approve this request, click: ${approveUrl}
To reject this request, click: ${rejectUrl}

Note: These links will expire in 24 hours and can only be used once.

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