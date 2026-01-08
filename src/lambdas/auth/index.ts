import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
} from "aws-lambda";
import jwt from "jsonwebtoken";
import { JWTPayload } from "../../shared/types";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
let cachedSecret: string | null = null;

const getJwtSecret = async (): Promise<string> => {
  if (cachedSecret) return cachedSecret;

  const paramName = process.env.JWT_SECRET_PARAM;
  if (!paramName) {
    throw new Error("JWT_SECRET_PARAM not set");
  }

  const response = await ssm.send(
    new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    })
  );
  console.log("response", response);

  if (!response.Parameter?.Value) {
    throw new Error("JWT secret not found in SSM");
  }

  cachedSecret = response.Parameter.Value;
  console.log("cached", cachedSecret);
  return cachedSecret;
};

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  try {
    const token = event.authorizationToken?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");

    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret) as JWTPayload;
    console.log("Decoded JWT payload:", decoded);

    return generatePolicy(decoded.userId, "Allow", event.methodArn, decoded);
  } catch (err) {
    console.error("Auth failed", err);
    throw new Error("Unauthorized");
  }
};

const generatePolicy = (
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  user: JWTPayload
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource,
      },
    ],
  },
  context: {
    userId: String(user.userId),
    email: String(user.email),
    role: String(user.role),
    name: String(user.name),
  },
});

export const generateToken = async (user: JWTPayload): Promise<string> => {
  const secret = await getJwtSecret();
  return jwt.sign(user, secret, { expiresIn: "24h" });
};
