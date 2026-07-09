package org.openharness.backend.qualification;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class QualificationRedactor {
  private static final String REDACTED = "[REDACTED]";
  private static final Set<String> SECRET_KEYS = Set.of(
      "authorization", "apikey", "accesstoken", "refreshtoken", "token", "secret", "password");
  private static final Pattern SECRET_VALUE = Pattern.compile(
      "(?i).*\\b(?:bearer\\s+\\S+|sk-[a-z0-9_-]+).*", Pattern.DOTALL);

  private QualificationRedactor() {}

  public static Object redact(Object value) {
    if (value instanceof String text) {
      return SECRET_VALUE.matcher(text).matches() ? REDACTED : text;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> result = new LinkedHashMap<>();
      map.forEach((keyValue, nested) -> {
        String key = String.valueOf(keyValue);
        result.put(key, isSecretKey(key) ? REDACTED : redact(nested));
      });
      return result;
    }
    if (value instanceof List<?> list) {
      List<Object> result = new ArrayList<>(list.size());
      list.forEach(item -> result.add(redact(item)));
      return result;
    }
    return value;
  }

  private static boolean isSecretKey(String key) {
    return SECRET_KEYS.contains(key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", ""));
  }
}
