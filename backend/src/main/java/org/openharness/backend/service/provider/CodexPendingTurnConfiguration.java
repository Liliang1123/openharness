package org.openharness.backend.service.provider;

import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** Production ownership and bounded configuration for the in-memory Codex turn registry. */
@Configuration(proxyBeanMethods = false)
public class CodexPendingTurnConfiguration {
  private static final String TTL_KEY = "openharness.codex.pending-turn.ttl";
  private static final String RETENTION_KEY = "openharness.codex.pending-turn.retention";
  private static final Duration DEFAULT_TTL = Duration.ofMinutes(65);
  private static final Duration DEFAULT_RETENTION = Duration.ofMinutes(5);
  private static final Duration MIN_DURATION = Duration.ofSeconds(1);
  private static final Duration MAX_TTL = Duration.ofHours(24);
  private static final Duration MAX_RETENTION = Duration.ofHours(1);

  @Bean("codexPendingTurnClock")
  Clock codexPendingTurnClock() {
    return Clock.systemUTC();
  }

  @Bean
  CodexPendingTurnRegistry codexPendingTurnRegistry(
      @Qualifier("codexPendingTurnClock") Clock clock,
      Environment environment) {
    Duration ttl = duration(environment, TTL_KEY, DEFAULT_TTL, MAX_TTL, "ttl");
    Duration retention = duration(
        environment, RETENTION_KEY, DEFAULT_RETENTION, MAX_RETENTION, "retention");
    return new CodexPendingTurnRegistry(clock, ttl, retention);
  }

  private static Duration duration(
      Environment environment,
      String key,
      Duration defaultValue,
      Duration maximum,
      String label) {
    Duration value;
    try {
      value = Duration.parse(environment.getProperty(key, defaultValue.toString()));
    } catch (RuntimeException invalid) {
      throw invalid(label);
    }
    if (value.compareTo(MIN_DURATION) < 0 || value.compareTo(maximum) > 0) {
      throw invalid(label);
    }
    return value;
  }

  private static IllegalArgumentException invalid(String label) {
    return new IllegalArgumentException("Codex pending-turn " + label + " configuration is invalid");
  }
}
