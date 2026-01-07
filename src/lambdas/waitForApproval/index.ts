import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME!;

interface WaitForApprovalEvent {
  leaveRequest: {
    leaveId: string;
    userId: string;
    userName: string;
    userEmail: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    approverEmail: string;
  };
  taskToken: string;
}

export const handler = async (event: WaitForApprovalEvent): Promise<void> => {
  console.log('WaitForApproval Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { leaveRequest, taskToken } = event;

   
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `TOKEN#${leaveRequest.leaveId}`,
          SK: 'TASKTOKEN',
          taskToken: taskToken,
          leaveId: leaveRequest.leaveId,
          createdAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        },
      })
    );

    console.log(`Task token stored for leave ${leaveRequest.leaveId}`);
    
  
  } catch (error: any) {
    console.error('Error storing task token:', error);
    throw error;
  }
};