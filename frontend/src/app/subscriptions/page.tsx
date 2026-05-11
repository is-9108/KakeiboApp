"use client";

import { useState, useEffect, useCallback } from "react";
import { getSubscriptions } from "@/lib/api/subscriptions";
import { Subscription } from "@/types";
import SubscriptionList from "@/components/subscriptions/SubscriptionList";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const load = useCallback(() => {
    getSubscriptions().then(setSubscriptions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <SubscriptionList subscriptions={subscriptions} onRefresh={load} />;
}
