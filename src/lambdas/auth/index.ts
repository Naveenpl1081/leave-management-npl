import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../../shared/types';


const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';


export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log('Auth Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
 
    const token = event.authorizationToken?.replace('Bearer ', '');

    if (!token) {
      console.log('No token provided');
      throw new Error('Unauthorized');
    }

 
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    console.log('Token verified for user:', decoded.userId);


    const policy = generatePolicy(decoded.userId, 'Allow', event.methodArn, decoded);

    return policy;
  } catch (error) {
    console.error('Authorization failed:', error);
    
    throw new Error('Unauthorized');
  }
};


const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  user: JWTPayload
): APIGatewayAuthorizerResult => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
};


export const generateToken = (user: JWTPayload): string => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
};