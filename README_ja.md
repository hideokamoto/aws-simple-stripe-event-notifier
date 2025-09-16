# AWS Simple Stripe Event Notifier

AWS CDK Construct Library for creating a complete Stripe event notification system using AWS EventBridge and SNS.

## 概要

このライブラリは、StripeのWebhookイベントをAWS EventBridgeで受信し、SNSトピックに通知を送信するためのCDK Constructを提供します。Stripeのパートナーイベントソースと連携して、リアルタイムでイベント通知を配信できます。

## 主な機能

- **EventBridge統合**: Stripeのパートナーイベントソースからイベントを受信
- **イベントフィルタリング**: 指定したイベントタイプのみを処理
- **SNS通知**: カスタマイズ可能なメッセージテンプレートでSNSに通知
- **自動IAM設定**: 必要な権限を自動的に設定
- **TypeScript対応**: 完全な型安全性を提供

## インストール

```bash
npm install aws-simple-stripe-event-notifier
```

## はじめに

### ステップ1: Stripe Event Destination & Amazon EventBridge のセットアップ

このライブラリを使用する前に、Stripe Event DestinationsとAmazon EventBridgeのパートナーイベントバスを設定する必要があります。以下の手順に従ってください：

#### 1.1: Workbenchの有効化
1. Stripeダッシュボードにアクセス
2. **Developer settings** → **Workbench** に移動
3. Workbenchが有効でない場合は有効化

#### 1.2: Event Destinationの作成
1. Workbenchの**Webhooks**タブを開く
2. **Create new destination**をクリック
3. 自分のアカウントのイベントを監視するため**Account**を選択
4. 受信したいイベントタイプを選択
5. 送信先タイプとして**Amazon EventBridge**を選択
6. AWSアカウントIDとリージョンを入力
7. **Create destination**をクリック

#### 1.3: パートナーイベントソースの関連付け
1. AWS Management Console → **EventBridge** → **Partner event sources** に移動
2. ステップ1.2で選択したリージョンを選択
3. 新しく作成されたパートナーイベントソースを探す（形式: `aws.partner/stripe.com/{UNIQUE_ID}`）
4. **Associate with event bus**をクリック
5. 権限を選択して**Associate**をクリック

#### 1.4: EventBridgeルールの作成
1. **EventBridge** → **Rules** に移動
2. **Create Rule**をクリック
3. ドロップダウンからイベントバスを選択
4. **Event source**で**AWS events or EventBridge partner events**を選択
5. **Event Pattern**で**EventBridge partners** → **Stripe**を選択
6. イベントタイプを選択するか**All events**を選択
7. ターゲット（SNS、Lambdaなど）を設定
8. **Create Rule**をクリック

詳細な手順については、[公式Stripeドキュメント](https://docs.stripe.com/event-destinations/eventbridge)を参照してください。

### ステップ2: ライブラリのインストールと使用

これで、CDKプロジェクトでライブラリをインストールして使用できます：

```bash
npm install aws-simple-stripe-event-notifier
```

## 使用方法

### 基本的な使用例

```typescript
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import { AwsSimpleStripeEventNotifier } from 'aws-simple-stripe-event-notifier';

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Stripeのパートナーイベントソースを参照
    const eventBus = events.EventBus.fromEventBusName(
      this,
      'StripePartnerEventBus',
      'aws.partner/stripe.com/ed_xxxx'
    );

    // SNSトピックを作成
    const topic = new sns.Topic(this, 'StripeNotificationTopic', {
      topicName: 'StripeEventNotifications',
    });

    // Stripeイベント通知システムを作成
    new AwsSimpleStripeEventNotifier(this, 'StripeEventNotifier', {
      eventBus,
      topic,
      eventTypes: ['payment_intent.succeeded', 'customer.created'],
      messageTemplate: (EventField) => ({
        version: '1.0',
        source: 'stripe',
        content: {
          textType: 'client-markdown',
          title: ':bell: Stripe イベント通知',
          description: [
            `**イベントタイプ:** ${EventField.fromPath('$.detail-type')}`,
            `**イベントID:** ${EventField.fromPath('$.id')}`,
            `**発生時刻:** ${EventField.fromPath('$.time')}`,
            '',
            '**詳細情報:**',
            `\`\`\`json\n${EventField.fromPath('$.detail')}\n\`\`\``,
          ].join('\n'),
        },
        metadata: {
          eventId: EventField.fromPath('$.id'),
          eventType: EventField.fromPath('$.detail-type'),
          eventTime: EventField.fromPath('$.time'),
        },
      }),
    });
  }
}
```

### Slack通知用の設定例

```typescript
// #shifter-activitiesチャンネル用のSNSトピック
const snsTopicForShifterActivitiesChannel = new sns.Topic(
  this,
  'SnsTopicForShifterActivitiesChannel',
  {
    topicName: 'NotifyToShifterActivitiesChannel',
  }
);

// Stripeサブスクリプション作成イベント用の通知
new AwsSimpleStripeEventNotifier(this, 'StripeSubscriptionCreatedToSNS', {
  eventBus,
  topic: snsTopicForShifterActivitiesChannel,
  eventTypes: ['customer.subscription.created'],
  messageTemplate: (EventField) => ({
    version: '1.0',
    source: 'custom',
    content: {
      textType: 'client-markdown',
      title: ':warning: Stripe サブスクリプション作成通知',
      description: [
        '新しいサブスクリプションが作成されました',
        '',
        '📋 *詳細情報:*',
        `• *サブスクリプション ID:* ${EventField.fromPath('$.detail.data.object.id')}`,
        `• *顧客ID:* ${EventField.fromPath('$.detail.data.object.customer')}`,
        `• *通貨:* ${EventField.fromPath('$.detail.data.object.currency')}`,
        `• *プラン名:* ${EventField.fromPath('$.detail.data.object.items.data[0].plan.nickname')}`,
        `• *請求間隔:* ${EventField.fromPath('$.detail.data.object.items.data[0].plan.interval')}`,
        '',
        '🔗 *Stripe Dashboard:*',
        `• <https://dashboard.stripe.com/customers/${EventField.fromPath('$.detail.data.object.customer')}|👤 顧客を確認>`,
        `• <https://dashboard.stripe.com/subscriptions/${EventField.fromPath('$.detail.data.object.id')}|📋 サブスクリプションを確認>`,
      ].join('\n'),
      nextSteps: [
        'Stripe ダッシュボードで新しいサブスクリプションの詳細を確認してください',
        '顧客の請求情報とプランが正しく設定されているか確認してください',
      ],
    },
    metadata: {
      customerId: EventField.fromPath('$.detail.data.object.customer'),
      subscriptionId: EventField.fromPath('$.detail.data.object.id'),
      eventTime: EventField.fromPath('$.time'),
      eventSource: EventField.fromPath('$.source'),
    },
  }),
});
```

## API リファレンス

### AwsSimpleStripeEventNotifierProps

| プロパティ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `eventBus` | `events.IEventBus` | ✅ | Stripeイベントを受信するEventBridgeイベントバス |
| `topic` | `sns.ITopic` | ✅ | 通知を送信するSNSトピック |
| `eventTypes` | `string[]` | ✅ | 監視するStripeイベントタイプの配列 |
| `messageTemplate` | `(EventField) => any` | ✅ | SNSメッセージを生成するテンプレート関数 |

### EventField ユーティリティ

`messageTemplate`関数内で使用できるEventFieldメソッド：

- `EventField.fromPath(path)`: JSONPathを使用してイベントデータから値を抽出
- `EventField.fromPath('$.id')`: イベントIDを取得
- `EventField.fromPath('$.detail-type')`: イベントタイプを取得
- `EventField.fromPath('$.time')`: イベント発生時刻を取得
- `EventField.fromPath('$.detail.data.object.*')`: Stripeイベントの詳細データにアクセス

## 追加設定

### AWS Chatbotの設定（Slack通知の場合）
- SNSトピックとSlackチャンネルを連携

## 対応イベントタイプ

Stripeのすべてのイベントタイプに対応しています。主要なイベントタイプ：

- `payment_intent.succeeded` - 支払い成功
- `customer.created` - 顧客作成
- `customer.subscription.created` - サブスクリプション作成
- `invoice.payment_succeeded` - 請求書支払い成功
- `charge.dispute.created` - チャージバック発生

詳細は[Stripe Webhook Events](https://stripe.com/docs/api/events/types)を参照してください。

## 開発

### セットアップ

```bash
npm install
```

### ビルド

```bash
npm run build
```

### テスト

```bash
npm run test
```

### ウォッチモード

```bash
npm run watch
```

## ライセンス

MIT License

## 貢献

プルリクエストやイシューの報告を歓迎します。

## サポート

問題が発生した場合は、GitHubのIssuesページで報告してください。
