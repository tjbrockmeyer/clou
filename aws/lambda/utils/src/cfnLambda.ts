import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { Schema } from "jsonschema";
import { createSender, Response, failed, success } from "./cfnResponse";
import { isValid, validate } from "./validateSchema";

type PromiseOr<T> = T | Promise<T>

interface Options<TProps, TData> {
    schema: Schema;
    noEcho?: boolean;
    getPhysicalId?: (props: TProps) => PromiseOr<string>;
    resourceExists: (props: TProps) => PromiseOr<boolean>;
    onCreate: (props: TProps) => PromiseOr<Response<TData>>;
    onUpdate: (props: TProps, before: TProps) => PromiseOr<Response<TData>>;
    onDelete: (props: TProps) => PromiseOr<Response<TData>>;
}

export const cfnLambda = <TProps, TData>(opts: Options<TProps, TData>) =>
    async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
        const schema = opts.schema as Schema;
        const props = event.ResourceProperties;
        const physicalResourceId = event.RequestType === 'Create' && isValid<TProps>(props, schema) && opts.getPhysicalId ? await opts.getPhysicalId(props) : undefined;
        const send = createSender({ event, context, physicalResourceId });
        const validationResult = validate(props, schema);
        if (event.RequestType !== 'Delete' && !validationResult.valid) {
            return send(failed(`the resource properties were invalid: ${validationResult.toString()}`));
        }
        try {
            const props = event.ResourceProperties as unknown as TProps;
            const exists = await opts.resourceExists(props);
            switch (event.RequestType) {
                case 'Create':
                    if (exists) {
                        return send(failed(`the resource already exists - cannot create it`));
                    }
                    return send(await opts.onCreate(props));
                case 'Update':
                    if (!exists) {
                        return send(failed(`the resource does not exist - it cannot be updated`));
                    }
                    return send(await opts.onUpdate(props, event.OldResourceProperties as unknown as TProps));
                case 'Delete':
                    if (!exists) {
                        return send(success());
                    }
                    return send(await opts.onDelete(props));
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? `'${error.name}' - ${error.message}` : String(error);
            return send(failed(`function crashed with ${message}`));
        }
    };