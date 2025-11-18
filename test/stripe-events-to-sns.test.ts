import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import {
  StripeEventsToSns,
  StripeEventsToSnsProps,
} from '../lib/index';

describe('StripeEventsToSns', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let eventBus: events.EventBus;
  let topic: sns.Topic;
  let props: StripeEventsToSnsProps;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    eventBus = new events.EventBus(stack, 'TestEventBus');
    topic = new sns.Topic(stack, 'TestTopic');
    props = {
      eventBus,
      topic,
      eventTypes: ['payment_intent.succeeded', 'customer.created'],
      messageTemplate: (eventField: typeof events.EventField) => ({
        message: `Stripe Event: ${eventField.fromPath('$.detail-type')}`,
        data: eventField.fromPath('$.detail'),
      }),
    };
  });

  // 1. コンストラクト初期化テスト
  describe('Constructor Initialization', () => {
    test('should create construct with valid props', () => {
      // WHEN
      const notifier = new StripeEventsToSns(
        stack,
        'TestNotifier',
        props
      );

      // THEN
      expect(notifier).toBeDefined();
      expect(notifier.node.id).toBe('TestNotifier');
    });

    test('should throw error when eventBus is not provided', () => {
      // GIVEN
      const invalidProps = { ...props, eventBus: undefined as any };

      // WHEN & THEN
      expect(() => {
        new StripeEventsToSns(stack, 'TestNotifier', invalidProps);
      }).toThrow();
    });

    test('should throw error when topic is not provided', () => {
      // GIVEN
      const invalidProps = { ...props, topic: undefined as any };

      // WHEN & THEN
      expect(() => {
        new StripeEventsToSns(stack, 'TestNotifier', invalidProps);
      }).toThrow();
    });

    test('should throw error when eventTypes is empty', () => {
      // GIVEN
      const invalidProps = { ...props, eventTypes: [] };

      // WHEN & THEN
      expect(() => {
        new StripeEventsToSns(stack, 'TestNotifier', invalidProps);
      }).toThrow();
    });

    test('should throw error when messageTemplate is not provided', () => {
      // GIVEN
      const invalidProps = { ...props, messageTemplate: undefined as any };

      // WHEN & THEN
      expect(() => {
        new StripeEventsToSns(stack, 'TestNotifier', invalidProps);
      }).toThrow();
    });
  });

  // 2. EventBridgeルール作成テスト
  describe('EventBridge Rule Creation', () => {
    test('should create EventBridge rule with correct properties', () => {
      // WHEN
      new StripeEventsToSns(stack, 'TestNotifier', props);
      const template = Template.fromStack(stack);

      // THEN
      template.hasResourceProperties('AWS::Events::Rule', {
        Description: 'Generic rule to relay Stripe events to SNS',
        EventPattern: {
          source: [{ prefix: 'aws.partner/stripe.com' }],
          'detail-type': ['payment_intent.succeeded', 'customer.created'],
        },
      });
    });

    test('should use provided event bus', () => {
      // WHEN
      new StripeEventsToSns(stack, 'TestNotifier', props);
      const template = Template.fromStack(stack);

      // THEN
      // Verify that the rule is actually using the custom event bus
      const rules = template.findResources('AWS::Events::Rule');
      expect(Object.keys(rules)).toHaveLength(1);
      const rule = Object.values(rules)[0];
      expect(rule.Properties.EventBusName).toBeDefined();
      expect(rule.Properties.EventBusName.Ref).toMatch(/^TestEventBus/);
    });

    test('should filter events by custom event types', () => {
      // GIVEN
      const customProps = {
        ...props,
        eventTypes: ['invoice.payment_succeeded', 'charge.dispute.created'],
      };

      // WHEN
      new AwsSimpleStripeEventNotifier(stack, 'TestNotifier', customProps);
      const template = Template.fromStack(stack);

      // THEN
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          source: [{ prefix: 'aws.partner/stripe.com' }],
          'detail-type': [
            'invoice.payment_succeeded',
            'charge.dispute.created',
          ],
        },
      });
    });
  });

  // 3. IAMポリシー設定テスト
  describe('IAM Policy Configuration', () => {
    test('should configure SNS topic policy correctly', () => {
      // WHEN
      new StripeEventsToSns(stack, 'TestNotifier', props);
      const template = Template.fromStack(stack);

      // THEN
      const policies = template.findResources('AWS::SNS::TopicPolicy');
      expect(Object.keys(policies)).toHaveLength(1);
      const policy = Object.values(policies)[0];

      expect(policy.Properties.PolicyDocument.Statement).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Effect: 'Allow',
            Principal: {
              Service: 'events.amazonaws.com',
            },
            Action: 'sns:Publish',
            Resource: expect.objectContaining({
              Ref: expect.stringMatching(/^TestTopic/),
            }),
            Condition: {
              StringEquals: {
                'aws:SourceArn': expect.objectContaining({
                  'Fn::GetAtt': [
                    expect.stringMatching(/^TestNotifierStripeEventRule/),
                    'Arn',
                  ],
                }),
              },
            },
          }),
        ])
      );
    });
  });

  // 4. SNSターゲット設定テスト
  describe('SNS Target Configuration', () => {
    test('should add SNS topic as target to EventBridge rule', () => {
      // WHEN
      new StripeEventsToSns(stack, 'TestNotifier', props);
      const template = Template.fromStack(stack);

      // THEN
      const rules = template.findResources('AWS::Events::Rule');
      expect(Object.keys(rules)).toHaveLength(1);
      const rule = Object.values(rules)[0];

      expect(rule.Properties.Targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Arn: expect.objectContaining({
              Ref: expect.stringMatching(/^TestTopic/),
            }),
            Id: 'Target0',
          }),
        ])
      );
    });
  });

  // 5. メッセージテンプレートテスト
  describe('Message Template', () => {
    test('should apply message template with InputTransformer', () => {
      // WHEN
      new StripeEventsToSns(stack, 'TestNotifier', props);
      const template = Template.fromStack(stack);

      // THEN
      const rules = template.findResources('AWS::Events::Rule');
      expect(Object.keys(rules)).toHaveLength(1);
      const rule = Object.values(rules)[0];

      expect(rule.Properties.Targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Arn: expect.objectContaining({
              Ref: expect.stringMatching(/^TestTopic/),
            }),
            InputTransformer: expect.objectContaining({
              InputTemplate: expect.any(String),
            }),
          }),
        ])
      );
    });
  });
});
