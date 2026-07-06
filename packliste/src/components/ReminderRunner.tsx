import { useEffect, useRef } from "react";
import { useDataProvider } from "../data/DataProviderContext";
import { useCurrentFamily } from "../hooks/useFamily";
import { useToast } from "./ui/Toast";
import {
  fireReminder,
  isReminderDue,
  markReminderShown,
  reminderShown,
} from "../reminders";

/**
 * Prüft beim App-Start (einmal pro Session) alle Trips der Familie auf
 * fällige Erinnerungen und löst Notification + In-App-Toast aus. Rendert
 * nichts.
 */
export function ReminderRunner() {
  const provider = useDataProvider();
  const family = useCurrentFamily();
  const toast = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (!family || ran.current) return;
    ran.current = true;
    const now = new Date();
    for (const trip of provider.listTrips(family.id)) {
      if (isReminderDue(trip, now) && !reminderShown(trip)) {
        const body = fireReminder(trip, now);
        toast.show({ message: `🔔 ${body}`, duration: 8000 });
        markReminderShown(trip);
      }
    }
  }, [family, provider, toast]);

  return null;
}
