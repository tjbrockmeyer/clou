import {
    Action,
    BaseResource,
    exceptions,
    handlerEvent,
    HandlerErrorCode,
    LoggerProxy,
    OperationStatus,
    Optional,
    ProgressEvent,
    ResourceHandlerRequest,
    SessionProxy,
} from '@amazon-web-services-cloudformation/cloudformation-cli-typescript-lib';
import { ResourceModel } from './models';
import { SSM } from 'aws-sdk';

const resultToModel = (r: SSM.Types.ParameterMetadata, tags: SSM.Types.TagList): ResourceModel => {
    return new ResourceModel({
        Name: r.Name,
        Description: r.Description,
        Type: r.Type,
        Tier: r.Tier,
        Policy: r.Policies.length > 0 ? r.Policies[0] : undefined,
        DataType: r.DataType,
        AllowedPattern: r.AllowedPattern,
        Tags: Object.assign({}, ...tags.map(({ Key, Value }) => ({ [Key]: Value }))),
    });
}

interface CallbackContext extends Record<string, any> { }

class Resource extends BaseResource<ResourceModel> {

    /**
     * CloudFormation invokes this handler when the resource is initially created
     * during stack create operations.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Create)
    public async create(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.desiredResourceState);
        const progress = ProgressEvent.progress<ProgressEvent<ResourceModel, CallbackContext>>(model);
        // TODO: put code here
        try {
            if (!(session instanceof SessionProxy)) {
                return ProgressEvent.failed<ProgressEvent<ResourceModel, CallbackContext>>(HandlerErrorCode.InvalidCredentials, "session is not instance of SessionProxy");
            }
            const ssm = session.client<SSM>('SSM');
            await ssm.putParameter({
                Name: model.name,
                Value: model.value_,
                Description: model.description,
                AllowedPattern: model.allowedPattern,
                DataType: model.dataType,
                Policies: model.policies,
                Tier: model.tier,
                Type: 'SecureString',
                Tags: Array.from(model.tags, ([k, v]) => ({ Key: k, Value: v }))
            }).promise();
            progress.status = OperationStatus.Success;
        } catch (err) {
            logger.log(err);
            throw new exceptions.InternalFailure(err.message);
        }
        return progress;
    }

    /**
     * CloudFormation invokes this handler when the resource is updated
     * as part of a stack update operation.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Update)
    public async update(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.desiredResourceState);
        const progress = ProgressEvent.progress<ProgressEvent<ResourceModel, CallbackContext>>(model);
        // TODO: put code here
        try {
            if (!(session instanceof SessionProxy)) {
                return ProgressEvent.failed<ProgressEvent<ResourceModel, CallbackContext>>(HandlerErrorCode.InvalidCredentials, "session is not instance of SessionProxy");
            }
            const ssm = session.client<SSM>('SSM');
            await ssm.putParameter({
                Name: model.name,
                Value: model.value_,
                Description: model.description,
                AllowedPattern: model.allowedPattern,
                DataType: model.dataType,
                Policies: model.policies,
                Type: 'SecureString',
                Tier: model.tier,
            }).promise();
            await ssm.removeTagsFromResource({
                ResourceType: "Parameter",
                ResourceId: model.name,
                TagKeys: Object.keys(request.previousResourceTags).filter(k => request.desiredResourceTags[k] === undefined)
            }).promise();
            await ssm.addTagsToResource({
                ResourceType: "Parameter",
                ResourceId: model.name,
                Tags: Object.keys(request.desiredResourceTags).map(k => ({ Key: k, Value: request.desiredResourceTags[k] }))
            }).promise();
            progress.status = OperationStatus.Success;
        } catch (err) {
            logger.log(err);
            throw new exceptions.InternalFailure(err.message);
        }
        return progress;
    }

    /**
     * CloudFormation invokes this handler when the resource is deleted, either when
     * the resource is deleted from the stack as part of a stack update operation,
     * or the stack itself is deleted.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Delete)
    public async delete(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.previousResourceState);
        const progress = ProgressEvent.progress<ProgressEvent<ResourceModel, CallbackContext>>(model);
        try {
            if (!(session instanceof SessionProxy)) {
                return ProgressEvent.failed<ProgressEvent<ResourceModel, CallbackContext>>(HandlerErrorCode.InvalidCredentials, "session is not instance of SessionProxy");
            }
            const ssm = session.client<SSM>('SSM');
            await ssm.deleteParameter({ Name: model.name }).promise();
            progress.status = OperationStatus.Success;
        } catch (err) {
            logger.log(err);
            throw new exceptions.InternalFailure(err.message);
        }
        return progress;
    }

    /**
     * CloudFormation invokes this handler as part of a stack update operation when
     * detailed information about the resource's current state is required.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Read)
    public async read(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.desiredResourceState);
        const progress = ProgressEvent.progress<ProgressEvent<ResourceModel, CallbackContext>>(model);
        try {
            if (!(session instanceof SessionProxy)) {
                return ProgressEvent.failed<ProgressEvent<ResourceModel, CallbackContext>>(HandlerErrorCode.InvalidCredentials, "session is not instance of SessionProxy");
            }
            const ssm = session.client<SSM>('SSM');
            const {Parameters: [param]} = await ssm.describeParameters({ ParameterFilters: [{ Key: 'Name', Values: [model.name] }] }).promise();
            const {TagList: tags} = await ssm.listTagsForResource({ ResourceType: 'Parameter', ResourceId: model.name }).promise();
            progress.resourceModel = resultToModel(param, tags);
            progress.status = OperationStatus.Success;
        } catch (err) {
            logger.log(err);
            throw new exceptions.InternalFailure(err.message);
        }
        return progress;
    }

    /**
     * CloudFormation invokes this handler when summary information about multiple
     * resources of this resource provider is required.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.List)
    public async list(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.desiredResourceState);
        try {
            if (!(session instanceof SessionProxy)) {
                return ProgressEvent.failed<ProgressEvent<ResourceModel, CallbackContext>>(HandlerErrorCode.InvalidCredentials, "session is not instance of SessionProxy");
            }
            const ssm = session.client<SSM>('SSM');
            const {Parameters: params} = await ssm.describeParameters({}).promise();
            const progress = ProgressEvent.builder<ProgressEvent<ResourceModel, CallbackContext>>()
                .status(OperationStatus.Success)
                .resourceModels(await Promise.all(params.map(async param => 
                    resultToModel(param, (await ssm.listTagsForResource({ ResourceType: 'Parameter', ResourceId: model.name }).promise()).TagList))))
                .build();
            return progress;
        } catch (err) {
            logger.log(err);
            throw new exceptions.InternalFailure(err.message);
        }
    }
}

export const resource = new Resource(ResourceModel.TYPE_NAME, ResourceModel);

// Entrypoint for production usage after registered in CloudFormation
export const entrypoint = resource.entrypoint;

// Entrypoint used for local testing
export const testEntrypoint = resource.testEntrypoint;
