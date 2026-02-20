import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import { Construct } from "constructs";

export class CheckoutStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Orders Table
    const ordersTable = new dynamodb.Table(this, "OrdersTable", {
      tableName: "CheckoutOrders",
      partitionKey: {
        name: "cartId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // Checkout Lambda Function
    const checkoutFunction = new lambda.Function(this, "CheckoutFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/checkout.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../dist/src")),
      environment: {
        ORDERS_TABLE_NAME: ordersTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant the Lambda read/write access to the DynamoDB table
    ordersTable.grantReadWriteData(checkoutFunction);

    // API Gateway
    const api = new apigateway.RestApi(this, "CheckoutApi", {
      restApiName: "Checkout Service",
      description: "Smart Order Fulfillment Checkout API",
      deployOptions: {
        stageName: "prod",
      },
    });

    // POST /checkout
    const checkout = api.root.addResource("checkout");
    checkout.addMethod(
      "POST",
      new apigateway.LambdaIntegration(checkoutFunction)
    );

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Checkout API URL",
    });

    new cdk.CfnOutput(this, "OrdersTableName", {
      value: ordersTable.tableName,
      description: "DynamoDB Orders Table Name",
    });
  }
}
