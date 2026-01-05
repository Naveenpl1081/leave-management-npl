import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { LeaveStatus } from '../../shared/types';
import {
  successResponse,
  errorResponse,
  getCurrentTimestamp,
} from '../../shared/utils';


const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

const TABLE_NAME = process.env.TABLE_NAME!;


export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Approve Leave Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {

    const approverId = event.requestContext.authorizer?.userId;
    const approverRole = event.requestContext.authorizer?.role;

    if (!approverId) {
      return errorResponse(401, 'Unauthorized - Invalid user context');
    }

   
    if (approverRole !== 'approver') {
      return errorResponse(403, 'Forbidden - Only approvers can approve leave requests');
    }

   
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    const body = JSON.parse(event.body);
    const { leaveId, action, taskToken } = body;

    
    if (!leaveId || !action) {
      return errorResponse(400, 'Missing required fields: leaveId, action');
    }

   
    if (action !== 'approve' && action !== 'reject') {
      return errorResponse(400, 'Invalid action. Must be "approve" or "reject"');
    }

   
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :leaveId',
        ExpressionAttributeValues: {
          ':leaveId': leaveId,
        },
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return errorResponse(404, 'Leave request not found');
    }

    const leaveRequest = queryResult.Items[0];

    
    if (leaveRequest.status !== LeaveStatus.PENDING) {
      return errorResponse(400, `Leave request already ${leaveRequest.status.toLowerCase()}`);
    }

 
    const newStatus = action === 'approve' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
    const updatedAt = getCurrentTimestamp();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: leaveId,
          SK: leaveRequest.SK,
        },
        UpdateExpression: 'SET #status = :status, approverId = :approverId, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': newStatus,
          ':approverId': approverId,
          ':updatedAt': updatedAt,
        },
      })
    );

    console.log(`Leave request ${leaveId} ${newStatus}`);

    
    if (taskToken) {
      try {
        await sfnClient.send(
          new SendTaskSuccessCommand({
            taskToken: taskToken,
            output: JSON.stringify({
              leaveId,
              status: newStatus,
              approverId,
              updatedAt,
            }),
          })
        );
        console.log('Step Functions task success sent');
      } catch (error) {
        console.error('Error sending task success:', error);
        
      }
    }

    return successResponse(
      {
        leaveId,
        status: newStatus,
        approverId,
        updatedAt,
      },
      `Leave request ${action}d successfully`
    );
  } catch (error: any) {
    console.error('Error approving leave:', error);
    return errorResponse(500, 'Failed to process leave request', error);
  }
};