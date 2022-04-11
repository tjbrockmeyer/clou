import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { Schema } from "jsonschema";
import { createSender, ResponseStatus, Response } from "./cnfResponse";
import { isValid, isValidOrThrow } from "./validateSchema";

type PromiseOr<T> = T | Promise<T>

interface Options<TProps, TData> {
    schema: Schema;
    noEcho?: boolean;
    getPhysicalId?: (props: TProps) => PromiseOr<string>;
    onCreate: (props: TProps) => PromiseOr<Response<TData>>;
    onUpdate: (props: TProps, before: TProps) => PromiseOr<Response<TData>>;
    onDelete: (props: TProps) => PromiseOr<Response<TData>>;
}

export const cfnLambda = <TProps, TData>(opts: Options<TProps, TData>) =>
    async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
        const schema = opts.schema as Schema;
        const props = event.ResourceProperties;
        const physicalResourceId = event.RequestType === 'Create'
            ? (isValid<TProps>(props, schema) && opts.getPhysicalId ? await opts.getPhysicalId(props) : undefined)
            : undefined;
        const send = createSender({ event, context, physicalResourceId });
        try {
            switch (event.RequestType) {
                case 'Create':
                    if (isValidOrThrow<TProps>(props, schema)) {
                        await send(await opts.onCreate(props))
                    }
                    break;
                case 'Update':
                    if (isValidOrThrow<TProps>(props, schema)) {
                        // prevProps could potentially be invalid, but it shouldn't interfere with the update.
                        await send(await opts.onUpdate(props, event.OldResourceProperties as unknown as TProps));
                    }
                    break;
                case 'Delete':
                    // again, there is a chance that the props are old and don't match the current schema.
                    await send(await opts.onDelete(props as unknown as TProps));
                    break;
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error(error);
                await send({ status: ResponseStatus.FAILED, reason: `function crashed with '${error.name}' - ${error.message}` });
            } else {
                await send({ status: ResponseStatus.FAILED, reason: String(error) });
            }
        }
    };
