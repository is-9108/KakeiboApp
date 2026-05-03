export const dynamic = "force-dynamic";

import { getSubscriptions } from "@/lib/api/subscriptions";
import SubscriptionList from "@/components/subscriptions/SubscriptionList";

export default async function SubscriptionsPage() {
  const subscriptions = await getSubscriptions();

  return <SubscriptionList subscriptions={subscriptions} />;
}
