const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';


const employee = {
  userId: 'emp001',
  email: 'naveenpl1081@gmail.com',
  name: 'Naveen Employee',
  role: 'employee'
};


const approver = {
  userId: 'apr001',
  email: 'naveenpl1081@gmail.com',
  name: 'Naveen Approver',
  role: 'approver'
};

const employeeToken = jwt.sign(employee, JWT_SECRET, { expiresIn: '24h' });
const approverToken = jwt.sign(approver, JWT_SECRET, { expiresIn: '24h' });

console.log('\n========================================');
console.log('EMPLOYEE TOKEN (for applying leave):');
console.log('========================================');
console.log(employeeToken);

console.log('\n========================================');
console.log('APPROVER TOKEN (for approving leave):');
console.log('========================================');
console.log(approverToken);

console.log('\n========================================');
console.log('Copy these tokens for Postman!');
console.log('========================================\n');