import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  type: "income" | "outgoing";
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(`categories-hook-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("categories")
        .select("id, name, color, icon, type")
        .order("name", { ascending: true });
      if (!mounted) return;
      setCategories((data as Category[]) ?? []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(channelId.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => load())
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { categories, loading };
}
