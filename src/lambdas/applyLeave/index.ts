import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  LeaveRequest,
  LeaveStatus,
  LeaveTableItem,
} from '../../shared/types';
import {
  successResponse,
  errorResponse,
  generateId,
  getCurrentTimestamp,
  isValidDate,
  isEndDateValid,
  isValidEmail,
} from '../../shared/utils';


const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;


export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Apply Leave Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {

    const userId = event.requestContext.authorizer?.userId;
    const userName = event.requestContext.authorizer?.name;
    const userEmail = event.requestContext.authorizer?.email;

    if (!userId || !userName || !userEmail) {
      return errorResponse(401, 'Unauthorized - Invalid user context');
    }

   
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    const body = JSON.parse(event.body);
    const { startDate, endDate, reason, approverEmail } = body;

   
    if (!startDate || !endDate || !reason || !approverEmail) {
      return errorResponse(400, 'Missing required fields: startDate, endDate, reason, approverEmail');
    }

    
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return errorResponse(400, 'Invalid date format. Use YYYY-MM-DD');
    }

    if (!isEndDateValid(startDate, endDate)) {
      return errorResponse(400, 'End date must be after or equal to start date');
    }


    if (!isValidEmail(approverEmail)) {
      return errorResponse(400, 'Invalid approver email format');
    }

 
    const leaveId = generateId();
    const createdAt = getCurrentTimestamp();

    const leaveRequest: LeaveRequest = {
      leaveId,
      userId,
      userName,
      userEmail,
      startDate,
      endDate,
      reason,
      status: LeaveStatus.PENDING,
      approverEmail,
      createdAt,
    };

    
    const item: LeaveTableItem = {
      PK: leaveId,
      SK: userId,
      ...leaveRequest,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    console.log('Leave request saved to DynamoDB:', leaveId);

   
    const executionInput = {
      leaveRequest,
      approverEmail,
    };

    const executionName = `leave-${leaveId}`;

    await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: executionName,
        input: JSON.stringify(executionInput),
      })
    );

    console.log('Step Functions execution started:', executionName);

    return successResponse(
      {
        leaveId,
        status: LeaveStatus.PENDING,
        message: 'Leave request submitted successfully. Waiting for approval.',
      },
      'Leave request created successfully'
    );
  } catch (error: any) {
    console.error('Error applying leave:', error);
    return errorResponse(500, 'Failed to apply leave', error);
  }
};