import { metrics } from "@opentelemetry/api";

import type { Counter, Histogram } from "@opentelemetry/api";

// Example custom metric. Resolved lazily so it binds to the real MeterProvider
// installed by the OTel SDK — creating instruments before the SDK starts would
// bind them to the no-op provider permanently.
let commentsCreated: Counter | undefined;

function getcommentsCreatedCounter(): Counter {
  commentsCreated ??= metrics
    .getMeter("core-api")
    .createCounter("comments_created_total", { description: "Total number of comments created" });
  return commentsCreated;
}

let postsCreated: Counter | undefined;

function getPostsCreatedCounter(): Counter {
  postsCreated ??= metrics
    .getMeter("core-api")
    .createCounter("posts_created_total", { description: "Total number of posts created" });
  return postsCreated;
}

// Outbound calls to dx-production-planning (PLANNING_API_URL).
//
//   outcome = ok | timeout | network_error | http_error | parse_error
let planningRequests: Counter | undefined;

function getPlanningRequestsCounter(): Counter {
  planningRequests ??= metrics.getMeter("core-api").createCounter("planning_requests_total", {
    description: "Outbound requests to dx-production-planning, labelled by operation and outcome",
  });
  return planningRequests;
}

let planningDuration: Histogram | undefined;

function getPlanningDurationHistogram(): Histogram {
  planningDuration ??= metrics
    .getMeter("core-api")
    .createHistogram("planning_request_duration_ms", {
      description: "Latency of outbound requests to dx-production-planning",
      unit: "ms",
    });
  return planningDuration;
}

export {
  getcommentsCreatedCounter,
  getPlanningDurationHistogram,
  getPlanningRequestsCounter,
  getPostsCreatedCounter,
};
