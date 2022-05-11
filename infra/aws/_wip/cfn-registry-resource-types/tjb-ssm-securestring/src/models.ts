// This is a generated file. Modifications will be overwritten.
import { BaseModel, Dict, integer, Integer, Optional, transformValue } from '@amazon-web-services-cloudformation/cloudformation-cli-typescript-lib';
import { Exclude, Expose, Type, Transform } from 'class-transformer';

export class ResourceModel extends BaseModel {
    ['constructor']: typeof ResourceModel;

    @Exclude()
    public static readonly TYPE_NAME: string = 'TJB::SSM::SecureString';

    @Exclude()
    protected readonly IDENTIFIER_KEY_NAME: string = '/properties/Name';

    @Expose({ name: 'AllowedPattern' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'allowedPattern', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    allowedPattern?: Optional<string>;
    @Expose({ name: 'DataType' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'dataType', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    dataType?: Optional<string>;
    @Expose({ name: 'Description' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'description', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    description?: Optional<string>;
    @Expose({ name: 'Name' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'name', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    name?: Optional<string>;
    @Expose({ name: 'Policies' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'policies', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    policies?: Optional<string>;
    @Expose({ name: 'Tags' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'tags', value, obj, [Map]),
        {
            toClassOnly: true,
        }
    )
    tags?: Optional<Map<string, string>>;
    @Expose({ name: 'Tier' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'tier', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    tier?: Optional<string>;
    @Expose({ name: 'Value' })
    @Transform(
        (value: any, obj: any) =>
            transformValue(String, 'value_', value, obj, []),
        {
            toClassOnly: true,
        }
    )
    value_?: Optional<string>;

    @Exclude()
    public getPrimaryIdentifier(): Dict {
        const identifier: Dict = {};
        if (this.name != null) {
            identifier[this.IDENTIFIER_KEY_NAME] = this.name;
        }

        // only return the identifier if it can be used, i.e. if all components are present
        return Object.keys(identifier).length === 1 ? identifier : null;
    }

    @Exclude()
    public getAdditionalIdentifiers(): Array<Dict> {
        const identifiers: Array<Dict> = new Array<Dict>();
        // only return the identifiers if any can be used
        return identifiers.length === 0 ? null : identifiers;
    }
}

