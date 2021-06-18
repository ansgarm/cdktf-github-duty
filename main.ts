import { Construct } from 'constructs';
import { App, TerraformStack, RemoteBackend, TerraformOutput } from 'cdktf';
import * as aws from "@cdktf/provider-aws";
import * as gh from "./.gen/providers/github";
import { NodejsFunction, Policy } from './lib';
import * as path from 'path';
import * as iam from 'iam-floyd';

class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);
    new aws.AwsProvider(this, "aws", {
      region: "us-east-1"
    });
    new gh.GithubProvider(this, 'github', {
      owner: "skorfmann"
    });

    // define resources here

    

    // Github Webhook on new Issues
    // -> AWS API Gateway 
    const api = new aws.Apigatewayv2Api(this, "gateway", {
      name: `${name}-gateway`,
      protocolType: "HTTP",
    });

    new gh.RepositoryWebhook(this, "webhook", {
      repository: "github-webhook",
      active: true,
      configuration: [{
        url: api.apiEndpoint,
        contentType: "json",
      }],
      events: ["issues"]
    })

    const fn = new NodejsFunction(this, 'code', {
      path: path.join(__dirname, 'functions', 'index.ts')
    });

    const role = new aws.IamRole(this, 'role', {
      name: `lambda-role`,
      assumeRolePolicy: Policy.document(new iam.Sts()
        .allow()
        .toAssumeRole()
        .forService('lambda.amazonaws.com')
      )
    })

    new aws.IamRolePolicyAttachment(this, "lambda-managed-policy", {
      policyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      role: role.name
  })

    const lambdaFunction = new aws.LambdaFunction(this, 'fn', {
      functionName: 'slack-hook',
      role: role.arn,
      handler: 'index.handler',
      filename: fn.asset.path,
      sourceCodeHash: fn.asset.assetHash,
      runtime: 'nodejs14.x'
    })

    new aws.LambdaPermission(this, 'lambda-permission', {
      functionName: lambdaFunction.arn,
      action: "lambda:InvokeFunction",
      principal: "apigateway.amazonaws.com",
      sourceArn: `${api.executionArn}/*/*`
    })

    const integration = new aws.Apigatewayv2Integration(this, 'lambda-integration', {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      connectionType: 'INTERNET',
      description: 'Lambda',
      integrationMethod: 'GET',
      integrationUri: lambdaFunction.arn,
      payloadFormatVersion: '2.0'
    })
    
    new aws.Apigatewayv2Route(this, 'route', {
      apiId: api.id,
      routeKey: "ANY /{proxy+}",
      target: `integrations/${integration.id}`
    })
    
    new aws.Apigatewayv2Stage(this, 'stage', {
      name: "$default",
      apiId: api.id,
      autoDeploy: true
    })

    new TerraformOutput(this, 'endpoint', {
      value: api.apiEndpoint
    });

    // -> AWS Lambda
    // === DynamoDB Table (to store who to notify this week)
    // -> Request to Slack Bot (-> send message about issue)
    // -> reaches someone of us
  }
}

const app = new App();
const stack = new MyStack(app, 'cdktf-github-duty');
new RemoteBackend(stack, {
  hostname: 'app.terraform.io',
  organization: 'cdktf',
  workspaces: {
    name: 'cdktf-github-duty'
  }
});
app.synth();
