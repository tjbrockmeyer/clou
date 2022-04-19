import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { createSender, Response, failed, success } from "./response";
import { Validator, Schema } from "../../helper";
import { randomUUID } from "crypto";

type PromiseOr<T> = T | Promise<T>

type CfnCustomResource = (event: CloudFormationCustomResourceEvent, context: Context) => Promise<void>;

interface Options<TProps, TData> {
    schema: Schema;
    noEcho?: boolean;
    getPhysicalId?: (props: TProps) => PromiseOr<string>;
    resourceExists: (props: TProps, physicalId: string) => PromiseOr<boolean>;
    onCreate: (props: TProps, physicalId: string) => PromiseOr<Response<TData>>;
    onUpdate: (props: TProps, before: TProps, physicalId: string) => PromiseOr<Response<TData>>;
    onDelete: (props: TProps, physicalId: string) => PromiseOr<Response<TData>>;
}

export const customResource = <TProps, TData>(opts: Options<TProps, TData>): CfnCustomResource => {
    const validator = new Validator<TProps>(opts.schema);
    return async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
        const props = event.ResourceProperties;
        const physicalResourceId = event.RequestType === 'Create' && validator.isValid(props) && opts.getPhysicalId ? await opts.getPhysicalId(props) : randomUUID();
        const send = createSender({ event, context, physicalResourceId });
        const validationResult = validator.getResult(props);
        if (event.RequestType !== 'Delete' && !validationResult.valid) {
            return send(failed(`the resource properties were invalid: ${validationResult.toString()}`));
        }
        try {
            const props = event.ResourceProperties as unknown as TProps;
            const exists = await opts.resourceExists(props, physicalResourceId);
            switch (event.RequestType) {
                case 'Create':
                    if (exists) {
                        return send(failed(`the resource already exists - cannot create it`));
                    }
                    return send(await opts.onCreate(props, physicalResourceId));
                case 'Update':
                    if (!exists) {
                        return send(failed(`the resource does not exist - it cannot be updated`));
                    }
                    return send(await opts.onUpdate(props, event.OldResourceProperties as unknown as TProps, physicalResourceId));
                case 'Delete':
                    if (!exists) {
                        return send(success());
                    }
                    return send(await opts.onDelete(props, physicalResourceId));
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? `'${error.name}' - ${error.message}` : String(error);
            return send(failed(`function crashed with ${message}`));
        }
    };
};