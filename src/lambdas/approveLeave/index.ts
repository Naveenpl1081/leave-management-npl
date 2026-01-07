import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
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
      (item) => !item.SK.startsWith("TOKEN#")
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
    console.log("tasktoken", taskToken);
 
    const newStatus =
      action === "approve" ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
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
      if (action === "approve") {
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
      } else {
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
        console.log("Step Functions task success sent (rejection)");
      }
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
  } catch (error: any) {
    console.error("Error approving leave:", error);
    return errorResponse(500, "Failed to process leave request", error);
  }
};
