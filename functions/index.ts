import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {    
    console.log(event)
    return {
        statusCode: 200,
        body: JSON.stringify({hello: 'World'}),
        headers: { 'Content-Type': 'application/json'},
    }
}
