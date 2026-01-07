# Leave Management System (Serverless)

A serverless leave management system built using AWS SAM, Step Functions, Lambda, API Gateway, DynamoDB, and TypeScript.  
This system supports JWT authentication, human approval workflows, and email notifications using Amazon SES.

---

## 🏗 Architecture

```
Client (Web / Mobile)
        |
        v
API Gateway (REST API)
        |
        v
Lambda Authorizer (JWT Auth)
        |
        v
Apply Leave Lambda
        |
        v
AWS Step Functions (Standard)
        |
        ├── Notify User Lambda (Email to Approver)
        |
        ├── Wait For Approval Lambda
        |       └── Stores Task Token in DynamoDB
        |
        └── (Wait State)
                |
Approver clicks Approve
        |
        v
Approve Leave Lambda
        |
        ├── Update DynamoDB
        └── SendTaskSuccess / SendTaskFailure
                |
                v
Workflow Ends
```

---

## ✨ Features

- JWT authentication with Lambda Authorizer
- Apply leave API for employees
- Human approval workflow using Step Functions
- Asynchronous approval using task tokens
- Email notifications via Amazon SES
- Fully serverless and scalable
- DynamoDB with TTL for cleanup
- Clean separation of concerns

---

## 🧠 Why Step Functions?

Step Functions are used to handle:
- Human approval delays
- Long-running workflows
- Reliable state persistence
- Built-in retry and error handling

This avoids polling or cron-based solutions.

---

## 🧩 AWS Services Used

- AWS Lambda
- API Gateway (REST)
- AWS Step Functions (Standard)
- DynamoDB
- Amazon SES
- SSM Parameter Store
- CloudWatch Logs

---

## 🔐 Authentication

- JWT-based authentication
- Custom Lambda Authorizer
- JWT secret stored in SSM Parameter Store

---

## 📡 API Endpoints

### Apply for Leave

```http
POST /leave/apply
Authorization: Bearer <JWT_TOKEN>
```

```json
{
  "startDate": "2026-02-01",
  "endDate": "2026-02-05",
  "reason": "Family vacation",
  "approverEmail": "manager@company.com"
}
```

---

### Approve / Reject Leave

```http
POST /leave/approve
Authorization: Bearer <JWT_TOKEN>
```

```json
{
  "leaveId": "leave-123",
  "action": "approve"
}
```

---

## 🔄 Workflow

1. Employee applies for leave
2. Request stored in DynamoDB with status `PENDING`
3. Step Functions workflow starts
4. Email sent to approver
5. Workflow waits for approval
6. Approver approves or rejects
7. Step Function resumes
8. DynamoDB updated
9. Workflow completes

---

## 📂 Project Structure

```
leave-management-npl/
├── src/
│   ├── lambdas/
│   │   ├── applyLeave/
│   │   ├── approveLeave/
│   │   ├── auth/
│   │   ├── notifyUser/
│   │   └── waitForApproval/
│   ├── stepfunctions/
│   │   └── leaveWorkflow.asl.json
│   └── shared/
├── tests/
├── template.yaml
├── package.json
└── README.md
```

---

## 🛠 Setup

### Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS SAM CLI installed

---

### Install Dependencies

```bash
npm install
```

---

### Build

```bash
sam build
```

---

### Deploy

```bash
sam deploy --guided
```

---

## 📧 Amazon SES Setup

1. Go to AWS SES Console
2. Verify sender email
3. Update `SENDER_EMAIL` in `template.yaml`

---

## 📊 Monitoring

- CloudWatch Logs for Lambda
- Step Functions execution history
- API Gateway metrics

---

## 🔒 Security

- JWT authentication
- Least-privilege IAM policies
- Encrypted data at rest (DynamoDB)
- HTTPS-only communication

---

## 📝 License

MIT License

---

## 👨‍💻 Author

Naveen
