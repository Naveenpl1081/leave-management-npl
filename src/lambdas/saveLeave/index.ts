import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME!;

interface SaveLeaveEvent {
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
    createdAt: string;
  };
}

export const handler = async (event: SaveLeaveEvent): Promise<any> => {
  console.log('Save Leave Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { leaveRequest } = event;

    const item = {
      PK: leaveRequest.leaveId,
      SK: leaveRequest.userId,
      ...leaveRequest,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    console.log('Leave request saved to DynamoDB:', leaveRequest.leaveId);

    return {
      statusCode: 200,
      body: {
        message: 'Leave request saved successfully',
        leaveId: leaveRequest.leaveId,
      },
    };
  } catch (error: any) {
    console.error('Error saving leave:', error);
    throw error;
  }
};