#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CheckoutStack } from "../lib/checkout-stack";

const app = new cdk.App();

new CheckoutStack(app, "CheckoutStack", {
  description: "Smart Order Fulfillment - Serverless Checkout Service",
});
