"use client";

import dynamic from "next/dynamic";

/**
 * Achievement celebrations, split out of every page's bundle: the code downloads after the page loads, and not
 * at all when they aren't shown (guests, Slim Amethyst).
 */
export const LazyAchievementNotifications = dynamic(() => import("./achievement-notifications").then((module) => module.AchievementNotifications), { ssr: false });
