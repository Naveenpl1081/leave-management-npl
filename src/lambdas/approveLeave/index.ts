import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SFNClient,
  SendTaskSuccessCommand,
} from "@aws-sdk/client-sfn";
import { LeaveStatus } from "../../shared/types";
import {
  successResponse,
  errorResponse,
  getCurrentTimestamp,
} from "../../shared/utils";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("Approve Leave Lambda triggered");
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    // Check if this is a token-based approval (from email button)
    const token = event.queryStringParameters?.token;
    
    if (token) {
      // Token-based approval (no JWT required)
      return await handleTokenBasedApproval(token);
    } else {
      // API-based approval (JWT required)
      return await handleAPIBasedApproval(event);
    }
  } catch (error: any) {
    console.error("Error approving leave:", error);
    return errorResponse(500, "Failed to process leave request", error);
  }
};

// Handle approval via email button click (token-based)
async function handleTokenBasedApproval(token: string): Promise<APIGatewayProxyResult> {
  console.log("Processing token-based approval");

  // Get token details from DynamoDB
  const tokenResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `APPROVAL_TOKEN#${token}`,
        SK: "TOKEN",
      },
    })
  );

  if (!tokenResult.Item) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">❌ Invalid or Expired Link</h1>
            <p>This approval link is invalid or has already been used.</p>
            <p>Please contact the administrator if you believe this is an error.</p>
          </body>
        </html>
      `,
    };
  }

  // Check if token has already been used
  if (tokenResult.Item.used) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">❌ Link Already Used</h1>
            <p>This approval link has already been used.</p>
            <p>The leave request has already been processed.</p>
          </body>
        </html>
      `,
    };
  }

  const { leaveId, action } = tokenResult.Item;

  // Get leave request details
  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :leaveId",
      ExpressionAttributeValues: {
        ":leaveId": leaveId,
      },
    })
  );

  if (!queryResult.Items || queryResult.Items.length === 0) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">❌ Leave Request Not Found</h1>
            <p>The leave request associated with this link could not be found.</p>
          </body>
        </html>
      `,
    };
  }

  const leaveRequest = queryResult.Items.find(
    (item) => !item.SK.startsWith("TOKEN#") && !item.SK.startsWith("APPROVAL_TOKEN#")
  );

  if (!leaveRequest) {
    return errorResponse(404, "Leave request not found");
  }

  if (leaveRequest.status !== LeaveStatus.PENDING) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #f39c12;">⚠️ Already Processed</h1>
            <p>This leave request has already been ${leaveRequest.status.toLowerCase()}.</p>
          </body>
        </html>
      `,
    };
  }

  // Get Step Functions task token
  const taskTokenResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TOKEN#${leaveId}`,
        SK: "TASKTOKEN",
      },
    })
  );

  if (!taskTokenResult.Item || !taskTokenResult.Item.taskToken) {
    return errorResponse(
      404,
      "Task token not found. The approval window may have expired."
    );
  }

  const taskToken = taskTokenResult.Item.taskToken;
  const newStatus = action === "approve" ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
  const updatedAt = getCurrentTimestamp();

  // Update leave request status
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: leaveId,
        SK: leaveRequest.SK,
      },
      UpdateExpression:
        "SET #status = :status, approverId = :approverId, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": newStatus,
        ":approverId": "EMAIL_APPROVAL",
        ":updatedAt": updatedAt,
      },
    })
  );

  // Mark token as used
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `APPROVAL_TOKEN#${token}`,
        SK: "TOKEN",
      },
      UpdateExpression: "SET used = :used",
      ExpressionAttributeValues: {
        ":used": true,
      },
    })
  );

  // Send success to Step Functions
  try {
    await sfnClient.send(
      new SendTaskSuccessCommand({
        taskToken: taskToken,
        output: JSON.stringify({
          status: newStatus,
          leaveId: leaveId,
          approverId: "EMAIL_APPROVAL",
          updatedAt: updatedAt,
        }),
      })
    );
    console.log("Step Functions task success sent");
  } catch (sfnError: any) {
    console.error("Error sending task success to Step Functions:", sfnError);
  }

  // Return HTML success page
  const actionText = action === "approve" ? "Approved" : "Rejected";
  const color = action === "approve" ? "#27ae60" : "#e74c3c";
  const icon = action === "approve" ? "✓" : "✗";

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: ${color};">${icon} Leave Request ${actionText}</h1>
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; display: inline-block; margin-top: 20px;">
            <p><strong>Leave ID:</strong> ${leaveId}</p>
            <p><strong>Employee:</strong> ${leaveRequest.userName}</p>
            <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">${newStatus}</span></p>
          </div>
          <p style="margin-top: 30px; color: #666;">
            The employee has been notified via email.
          </p>
        </body>
      </html>
    `,
  };
}

// Handle approval via API call (JWT required)
async function handleAPIBasedApproval(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log("Processing API-based approval");

  const approverId = event.requestContext.authorizer?.userId;
  const approverRole = event.requestContext.authorizer?.role;

  if (!approverId) {
    return errorResponse(401, "Unauthorized - Invalid user context");
  }

  if (approverRole !== "approver") {
    return errorResponse(
      403,
      "Forbidden - Only approvers can approve leave requests"
    );
  }

  if (!event.body) {
    return errorResponse(400, "Request body is required");
  }

  const body = JSON.parse(event.body);
  const { leaveId, action } = body;

  if (!leaveId || !action) {
    return errorResponse(400, "Missing required fields: leaveId, action");
  }

  if (action !== "approve" && action !== "reject") {
    return errorResponse(
      400,
      'Invalid action. Must be "approve" or "reject"'
    );
  }

  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :leaveId",
      ExpressionAttributeValues: {
        ":leaveId": leaveId,
      },
    })
  );

  if (!queryResult.Items || queryResult.Items.length === 0) {
    return errorResponse(404, "Leave request not found");
  }

  const leaveRequest = queryResult.Items.find(
    (item) => !item.SK.startsWith("TOKEN#") && !item.SK.startsWith("APPROVAL_TOKEN#")
  );

  if (!leaveRequest) {
    return errorResponse(404, "Leave request not found");
  }

  if (leaveRequest.status !== LeaveStatus.PENDING) {
    return errorResponse(
      400,
      `Leave request already ${leaveRequest.status.toLowerCase()}`
    );
  }

  const tokenResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TOKEN#${leaveId}`,
        SK: "TASKTOKEN",
      },
    })
  );

  if (!tokenResult.Item || !tokenResult.Item.taskToken) {
    return errorResponse(
      404,
      "Task token not found. The approval window may have expired."
    );
  }

  const taskToken = tokenResult.Item.taskToken;
  const newStatus = action === "approve" ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
  const updatedAt = getCurrentTimestamp();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: leaveId,
        SK: leaveRequest.SK,
      },
      UpdateExpression:
        "SET #status = :status, approverId = :approverId, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": newStatus,
        ":approverId": approverId,
        ":updatedAt": updatedAt,
      },
    })
  );

  console.log(`Leave request ${leaveId} ${newStatus}`);

  try {
    await sfnClient.send(
      new SendTaskSuccessCommand({
        taskToken: taskToken,
        output: JSON.stringify({
          status: newStatus,
          leaveId: leaveId,
          approverId: approverId,
          updatedAt: updatedAt,
        }),
      })
    );
    console.log("Step Functions task success sent");
  } catch (sfnError: any) {
    console.error("Error sending task success to Step Functions:", sfnError);
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
}