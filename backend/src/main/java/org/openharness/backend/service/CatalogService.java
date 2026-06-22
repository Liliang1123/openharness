package org.openharness.backend.service;

import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.CatalogResponse;
import org.openharness.backend.model.Contracts.ToolDefinition;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
  public static final String CATALOG_VERSION = "2026-05-19T10:00:00Z";
  public static final String CATALOG_HASH = "sha256:p0a-catalog";

  public CatalogResponse catalog() {
    return new CatalogResponse(CATALOG_VERSION, CATALOG_HASH, tools());
  }

  public boolean matches(String version, String hash) {
    return CATALOG_VERSION.equals(version) && CATALOG_HASH.equals(hash);
  }

  public boolean hasTool(String name) {
    return tools().stream().anyMatch(tool -> tool.name().equals(name));
  }

  public String getPermission(String name) {
    return tools().stream()
        .filter(tool -> tool.name().equals(name))
        .map(ToolDefinition::permission)
        .findFirst().orElse("safe");
  }

  private List<ToolDefinition> tools() {
    return List.of(
        new ToolDefinition(
            "get_current_time",
            "Get current time by timezone",
            Map.of(
                "type", "object",
                "properties", Map.of("timezone", Map.of("type", "string")),
                "required", List.of("timezone")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "safe",
            true,
            false,
            false,
            true,
            null),
        new ToolDefinition(
            "echo",
            "Echo input text",
            Map.of(
                "type", "object",
                "properties", Map.of("text", Map.of("type", "string")),
                "required", List.of("text")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "safe",
            true,
            false,
            false,
            true,
            null),
        new ToolDefinition(
            "submit_payment",
            "Submit a payment (sensitive, requires approval)",
            Map.of(
                "type", "object",
                "properties", Map.of("amount", Map.of("type", "number"), "to", Map.of("type", "string")),
                "required", List.of("amount", "to")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "sensitive",
            false,
            false,
            true,
            true,
            null),
        new ToolDefinition(
            "read_file",
            "Read a UTF-8 file from the configured tool workspace",
            Map.of(
                "type", "object",
                "properties", Map.of("path", Map.of("type", "string")),
                "required", List.of("path")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "safe",
            true,
            false,
            false,
            true,
            "read_file"),
        new ToolDefinition(
            "search",
            "Search workspace files for a literal query",
            Map.of(
                "type", "object",
                "properties", Map.of("query", Map.of("type", "string")),
                "required", List.of("query")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "safe",
            true,
            false,
            false,
            true,
            "search"),
        new ToolDefinition(
            "run_command",
            "Run an allow-listed command without shell evaluation",
            Map.of(
                "type", "object",
                "properties", Map.of(
                    "command", Map.of("type", "string"),
                    "args", Map.of("type", "array")),
                "required", List.of("command")),
            CATALOG_VERSION,
            CATALOG_HASH,
            "safe",
            true,
            false,
            false,
            false,
            "run_command"));
  }
}
