/* Copyright 2015 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
   This file is licensed to you under the AWS Customer Agreement (the "License").
   You may not use this file except in compliance with the License.
   A copy of the License is located at http://aws.amazon.com/agreement/ .
   This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied.
   See the License for the specific language governing permissions and limitations under the License. */
   
/**
 * Modified by Tyler Brockmeyer 04/09/2022
 * Purpose of modifications: 
 *  Enhance functionality and typechecking
 */

import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import https from 'https';
import url from 'url';

export interface BaseResponse {
    /** The event that came into the lambda function */
    event: CloudFormationCustomResourceEvent;
    /** The lambda function context */
    context: Context;
    /** 
     * This value should be an identifier unique to the custom resource vendor, and can be up to 1 KB in size. The value must be a non-empty string and must be identical for all responses for the same resource
     * 
     * Accessible from cloudformation templates with the Ref function
     */
    physicalResourceId?: string;
    /** Optional. If true, all properties sent in the 'data' property will be masked in cloudformation */
    noEcho?: boolean;
}

export type Response<T> = {
    status: ResponseStatus.SUCCESS;
    /** Optional. The custom resource provider-defined name-value pairs to send with the response. You can access the values provided here by name in the template with Fn::GetAtt */
    data?: T;
} | {
    status: ResponseStatus.FAILED;
    /** Describes the reason for a failure response */
    reason: string;
}

export enum ResponseStatus {
    SUCCESS = "SUCCESS",
    FAILED = "FAILED"
}

export const success = <T>(data?: T): Response<T> => ({ status: ResponseStatus.SUCCESS, data });

export const failure = <T>(reason: string): Response<T> => ({ status: ResponseStatus.FAILED, reason });

export const createSender = <T>(baseRes: BaseResponse) => {
    return async (res: Response<T>) => send({ ...baseRes, ...res });
}

export const send = async <T>(res: BaseResponse & Response<T>) => {
    const { event, context, physicalResourceId } = res;
    const responseBody = JSON.stringify({
        Status: res.status,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: physicalResourceId || context.logStreamName,
        NoEcho: res.noEcho || false,
        ...(res.status === ResponseStatus.SUCCESS ? {
            Data: res.data,
        } : {
            Reason: `Error: ${res.reason}\nView the logs in cloudwatch: ${context.logGroupName}/${context.logStreamName}`,
        })
    });

    const parsedUrl = url.parse(event.ResponseURL);
    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: "PUT",
        headers: {
            "content-type": "",
            "content-length": responseBody.length
        }
    };
    
    return new Promise<void>((resolve, reject) => {
        const request = https.request(options, (response) => {
            console.info("Status code: " + response.statusCode);
            console.info("Status message: " + response.statusMessage);
            resolve();
        });
        request.on("error", (error) => {
            console.error("send(..) failed executing https.request(..): " + error);
            reject(error);
        });
        console.info("Response body:\n", responseBody);
        request.write(responseBody);
        request.end();
    });
}
