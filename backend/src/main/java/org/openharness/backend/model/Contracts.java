package org.openharness.backend.model;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigInteger;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class Contracts {
  private static final ObjectMapper STRICT_JSON = new ObjectMapper(
      JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build());

  private Contracts() {}

  public static String canonicalizeCodexArguments(String raw) {
    if (raw == null || raw.length() < 2 || raw.length() > 65_536) {
      throw new IllegalArgumentException("arguments must be a bounded JSON object");
    }
    try {
      JsonNode value = STRICT_JSON.readTree(raw);
      if (value == null || !value.isObject()) {
        throw new IllegalArgumentException("arguments must be a JSON object");
      }
      StringBuilder canonical = new StringBuilder(raw.length());
      appendCanonicalJson(value, canonical);
      String result = canonical.toString();
      CodexContractValidator.canonicalObject(result);
      return result;
    } catch (IOException exception) {
      throw new IllegalArgumentException("arguments must be valid JSON", exception);
    }
  }

  private static void appendCanonicalJson(JsonNode value, StringBuilder output) {
    if (value.isObject()) {
      output.append('{');
      boolean[] first = {true};
      value.properties().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
        if (!first[0]) output.append(',');
        first[0] = false;
        output.append(CodexContractValidator.canonicalString(entry.getKey())).append(':');
        appendCanonicalJson(entry.getValue(), output);
      });
      output.append('}');
    } else if (value.isArray()) {
      output.append('[');
      for (int index = 0; index < value.size(); index++) {
        if (index > 0) output.append(',');
        appendCanonicalJson(value.get(index), output);
      }
      output.append(']');
    } else if (value.isTextual()) {
      output.append(CodexContractValidator.canonicalString(value.textValue()));
    } else if (value.isNumber()) {
      double number = value.doubleValue();
      if (!Double.isFinite(number)) throw new IllegalArgumentException("arguments number must be finite");
      output.append(CodexContractValidator.javascriptNumber(number));
    } else if (value.isBoolean()) {
      output.append(value.booleanValue());
    } else if (value.isNull()) {
      output.append("null");
    } else {
      throw new IllegalArgumentException("unsupported JSON value");
    }
    if (output.length() > 65_536) throw new IllegalArgumentException("canonical arguments exceed bound");
  }

  public record StructuredError(
      String errorClass,
      String errorMessage,
      boolean retriable,
      String retryOwner,
      Integer maxRetries,
      Boolean fallbackAllowed,
      Integer httpStatus,
      Map<String, Object> recoveryHint) {}

  public record ErrorResponse(StructuredError error) {}

  public record ToolCall(String id, String name, String argumentsRaw) {}

  public record AgentMessage(
      String role,
      Object content,
      List<ToolCall> toolCalls,
      String toolCallId,
      List<Map<String, Object>> reasoningBlocks,
      String requestId,
      String conversationId,
      String taskId,
      Boolean systemInjected,
      Boolean sessionContext,
      Boolean compressedSummary,
      Boolean compressionInstruction,
      Boolean transientMessage) {}

  public record ToolDefinition(
      String name,
      String description,
      Map<String, Object> parameters,
      String catalogVersion,
      String catalogHash,
      String permission,
      boolean isReadOnly,
      boolean isDestructive,
      boolean requiresApproval,
      boolean isConcurrencySafe,
      String protocol) {}

  public record CatalogResponse(String catalogVersion, String catalogHash, List<ToolDefinition> tools) {}

  public record ModelChatRequest(
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String model,
      boolean stream,
      List<AgentMessage> messages,
      List<ToolDefinition> tools,
      Map<String, Object> meta) {}

  public record Usage(
      int promptTokens,
      int completionTokens,
      int totalTokens,
      Integer cacheReadTokens,
      Integer cacheWriteTokens,
      Boolean totalIsPerTurn,
      Integer costUsdMicros) {}

  public record PendingCodexTurn(
      String bridgeId,
      String threadId,
      String turnId,
      String callId,
      String toolName,
      String argumentsRaw,
      String expiresAt) {
    public PendingCodexTurn {
      CodexContractValidator.identifier(bridgeId, "bridgeId");
      CodexContractValidator.identifier(threadId, "threadId");
      CodexContractValidator.identifier(turnId, "turnId");
      CodexContractValidator.identifier(callId, "callId");
      CodexContractValidator.identifier(toolName, "toolName");
      CodexContractValidator.canonicalObject(argumentsRaw);
      CodexContractValidator.utcExpiry(expiresAt);
    }
  }

  public record CodexToolResultSubmission(
      String requestId,
      String conversationId,
      String threadId,
      String turnId,
      String callId,
      String idempotencyKey,
      String status,
      String content) {
    public CodexToolResultSubmission {
      CodexContractValidator.identifier(requestId, "requestId");
      CodexContractValidator.identifier(conversationId, "conversationId");
      CodexContractValidator.identifier(threadId, "threadId");
      CodexContractValidator.identifier(turnId, "turnId");
      CodexContractValidator.identifier(callId, "callId");
      CodexContractValidator.identifier(idempotencyKey, "idempotencyKey");
      CodexContractValidator.status(status);
      CodexContractValidator.content(content);
    }

    @JsonAnySetter
    public void rejectUnknownField(String ignoredName, Object ignoredValue) {
      throw new IllegalArgumentException("unknown field is not allowed");
    }
  }

  public record CodexTurnCancelRequest(
      String requestId,
      String conversationId,
      String threadId,
      String turnId,
      String callId) {
    public CodexTurnCancelRequest {
      CodexContractValidator.identifier(requestId, "requestId");
      CodexContractValidator.identifier(conversationId, "conversationId");
      CodexContractValidator.identifier(threadId, "threadId");
      CodexContractValidator.identifier(turnId, "turnId");
      CodexContractValidator.identifier(callId, "callId");
    }

    @JsonAnySetter
    public void rejectUnknownField(String ignoredName, Object ignoredValue) {
      throw new IllegalArgumentException("unknown field is not allowed");
    }
  }

  private static final class CodexContractValidator {
    private static final int IDENTIFIER_MAX = 256;
    private static final int CONTENT_MAX = 65_536;
    private static final int MAX_NESTING = 128;
    private static final Set<String> STATUSES = Set.of("ok", "error", "rejected", "timeout");

    private CodexContractValidator() {}

    static void identifier(String value, String field) {
      if (value == null || value.isEmpty() || value.length() > IDENTIFIER_MAX) {
        throw new IllegalArgumentException(field + " must contain 1..256 characters");
      }
    }

    static void content(String value) {
      if (value == null || value.length() > CONTENT_MAX) {
        throw new IllegalArgumentException("content must contain at most 65536 characters");
      }
    }

    static void status(String value) {
      if (!STATUSES.contains(value)) throw new IllegalArgumentException("invalid Codex result status");
    }

    static void utcExpiry(String value) {
      if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z")) {
        throw new IllegalArgumentException("expiresAt must use UTC seconds or milliseconds");
      }
      try {
        String normalized = value.endsWith(".000Z")
            ? value.substring(0, value.length() - ".000Z".length()) + "Z"
            : value;
        if (!Instant.parse(value).toString().equals(normalized)) {
          throw new IllegalArgumentException("expiresAt must be canonical UTC");
        }
      } catch (DateTimeParseException exception) {
        throw new IllegalArgumentException("expiresAt must be a valid UTC instant", exception);
      }
    }

    static void canonicalObject(String value) {
      if (value == null || value.length() < 2 || value.length() > CONTENT_MAX || !boundedNesting(value)
          || !new CanonicalJsonParser(value).parseObjectText()) {
        throw new IllegalArgumentException("argumentsRaw must be canonical JSON object text");
      }
    }

    private static boolean boundedNesting(String raw) {
      int depth = 0;
      boolean inString = false;
      boolean escaped = false;
      for (int index = 0; index < raw.length(); index++) {
        char character = raw.charAt(index);
        if (inString) {
          if (!escaped && character == '"') inString = false;
          escaped = !escaped && character == '\\';
        } else if (character == '"') {
          inString = true;
        } else if (character == '{' || character == '[') {
          if (++depth > MAX_NESTING) return false;
        } else if (character == '}' || character == ']') {
          if (--depth < 0) return false;
        }
      }
      return depth == 0 && !inString;
    }

    private static final class CanonicalJsonParser {
      private final String raw;
      private int position;

      CanonicalJsonParser(String raw) {
        this.raw = raw;
      }

      boolean parseObjectText() {
        return parseObject() && position == raw.length();
      }

      private boolean parseValue() {
        if (position >= raw.length()) return false;
        return switch (raw.charAt(position)) {
          case '{' -> parseObject();
          case '[' -> parseArray();
          case '"' -> parseString() != null;
          case 't' -> consume("true");
          case 'f' -> consume("false");
          case 'n' -> consume("null");
          default -> parseNumber();
        };
      }

      private boolean parseObject() {
        if (!consume("{")) return false;
        if (consume("}")) return true;
        Set<String> keys = new HashSet<>();
        String previous = null;
        while (true) {
          String key = parseString();
          if (key == null || !keys.add(key) || (previous != null && previous.compareTo(key) >= 0)) return false;
          previous = key;
          if (!consume(":") || !parseValue()) return false;
          if (consume("}")) return true;
          if (!consume(",")) return false;
        }
      }

      private boolean parseArray() {
        if (!consume("[")) return false;
        if (consume("]")) return true;
        while (true) {
          if (!parseValue()) return false;
          if (consume("]")) return true;
          if (!consume(",")) return false;
        }
      }

      private String parseString() {
        if (position >= raw.length() || raw.charAt(position) != '"') return null;
        int start = position++;
        boolean escaped = false;
        while (position < raw.length()) {
          char character = raw.charAt(position++);
          if (!escaped && character == '"') {
            String decoded = decodeString(raw.substring(start, position));
            return decoded != null && canonicalString(decoded).equals(raw.substring(start, position)) ? decoded : null;
          }
          escaped = !escaped && character == '\\';
        }
        return null;
      }

      private boolean parseNumber() {
        int start = position;
        if (position < raw.length() && raw.charAt(position) == '-') position++;
        if (position >= raw.length()) return false;
        if (raw.charAt(position) == '0') {
          position++;
        } else if (raw.charAt(position) >= '1' && raw.charAt(position) <= '9') {
          while (position < raw.length() && Character.isDigit(raw.charAt(position))) position++;
        } else return false;
        if (position < raw.length() && raw.charAt(position) == '.') {
          position++;
          int fraction = position;
          while (position < raw.length() && Character.isDigit(raw.charAt(position))) position++;
          if (fraction == position) return false;
        }
        if (position < raw.length() && raw.charAt(position) == 'e') {
          position++;
          if (position < raw.length() && (raw.charAt(position) == '+' || raw.charAt(position) == '-')) position++;
          int exponent = position;
          while (position < raw.length() && Character.isDigit(raw.charAt(position))) position++;
          if (exponent == position) return false;
        }
        String token = raw.substring(start, position);
        try {
          double value = Double.parseDouble(token);
          return Double.isFinite(value) && Double.doubleToRawLongBits(value) != Double.doubleToRawLongBits(-0.0d)
              && javascriptNumber(value).equals(token);
        } catch (NumberFormatException exception) {
          return false;
        }
      }

      private boolean consume(String expected) {
        if (!raw.startsWith(expected, position)) return false;
        position += expected.length();
        return true;
      }
    }

    private static String javascriptNumber(double value) {
      if (value == 0.0d) return "0";
      if (!Double.isFinite(value)) throw new IllegalArgumentException("number must be finite");
      return EcmaScriptDouble.serialize(value, true);
    }

    /*
     * Source pin: cyberphone/json-canonicalization commit
     * 19d51d7fe467d4706a3ff08adf8a748f29fc21e0, DoubleCoreSerializer.java,
     * SHA-256 61246c838dbfdf372ca7955768695dffe3ffeabb09a8739dbb1bc2245a7561d7.
     * Adaptation is limited to nesting and naming within this contract validator.
     *
     *  Copyright 2018 Ulf Adams.
     *
     *  Modifications for ECMAScript / RFC 8785 by Anders Rundgren
     *
     *  Licensed under the Apache License, Version 2.0 (the "License");
     *  you may not use this file except in compliance with the License.
     *  You may obtain a copy of the License at
     *
     *      https://www.apache.org/licenses/LICENSE-2.0
     *
     *  Unless required by applicable law or agreed to in writing, software
     *  distributed under the License is distributed on an "AS IS" BASIS,
     *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     *  See the License for the specific language governing permissions and
     *  limitations under the License.
     *
     */
    /**
     * An implementation of Ryu for serializing IEEE-754 double precision values
     * as specified by ECMAScript
     */
    private static final class EcmaScriptDouble {
        private static boolean DEBUG = false;

        private static final int DOUBLE_MANTISSA_BITS = 52;
        private static final long DOUBLE_MANTISSA_MASK = (1L << DOUBLE_MANTISSA_BITS) - 1;

        private static final int DOUBLE_EXPONENT_BITS = 11;
        private static final int DOUBLE_EXPONENT_MASK = (1 << DOUBLE_EXPONENT_BITS) - 1;
        private static final int DOUBLE_EXPONENT_BIAS = (1 << (DOUBLE_EXPONENT_BITS - 1)) - 1;

        private static final int POS_TABLE_SIZE = 326;
        private static final int NEG_TABLE_SIZE = 291;

        // Only for debugging.
        private static final BigInteger[] POW5 = new BigInteger[POS_TABLE_SIZE];
        private static final BigInteger[] POW5_INV = new BigInteger[NEG_TABLE_SIZE];

        private static final int POW5_BITCOUNT = 121; // max 3*31 = 124
        private static final int POW5_QUARTER_BITCOUNT = 31;
        private static final int[][] POW5_SPLIT = new int[POS_TABLE_SIZE][4];

        private static final int POW5_INV_BITCOUNT = 122; // max 3*31 = 124
        private static final int POW5_INV_QUARTER_BITCOUNT = 31;
        private static final int[][] POW5_INV_SPLIT = new int[NEG_TABLE_SIZE][4];

        static {
            BigInteger mask = BigInteger.valueOf(1)
                    .shiftLeft(POW5_QUARTER_BITCOUNT).subtract(BigInteger.ONE);
            BigInteger invMask = BigInteger.valueOf(1)
                    .shiftLeft(POW5_INV_QUARTER_BITCOUNT).subtract(BigInteger.ONE);
            for (int i = 0; i < Math.max(POW5.length, POW5_INV.length); i++) {
                BigInteger pow = BigInteger.valueOf(5).pow(i);
                int pow5len = pow.bitLength();
                int expectedPow5Bits = pow5bits(i);
                if (expectedPow5Bits != pow5len) {
                    throw new IllegalStateException(pow5len + " != "
                            + expectedPow5Bits);
                }
                if (i < POW5.length) {
                    POW5[i] = pow;
                }
                if (i < POW5_SPLIT.length) {
                    for (int j = 0; j < 4; j++) {
                        POW5_SPLIT[i][j] = pow
                                .shiftRight(
                                        pow5len - POW5_BITCOUNT + (3 - j)
                                                * POW5_QUARTER_BITCOUNT).and(mask)
                                .intValue();
                    }
                }

                if (i < POW5_INV_SPLIT.length) {
                    // We want floor(log_2 5^q) here, which is pow5len - 1.
                    int j = pow5len - 1 + POW5_INV_BITCOUNT;
                    BigInteger inv = BigInteger.ONE.shiftLeft(j).divide(pow)
                            .add(BigInteger.ONE);
                    POW5_INV[i] = inv;
                    for (int k = 0; k < 4; k++) {
                        if (k == 0) {
                            POW5_INV_SPLIT[i][k] = inv.shiftRight(
                                    (3 - k) * POW5_INV_QUARTER_BITCOUNT)
                                    .intValue();
                        } else {
                            POW5_INV_SPLIT[i][k] = inv
                                    .shiftRight((3 - k) * POW5_INV_QUARTER_BITCOUNT)
                                    .and(invMask).intValue();
                        }
                    }
                }
            }
        }

        /**
         * Formats a number according to ECMAScript.
         * <p>
         * This code is emulating 7.1.12.1 of the EcmaScript V6 specification.
         * </p>
         *
         * @param value Value to be formatted
         * @param ecmaMode If <code>true</code> use EcmaScript notation else use EcmaScript
         * but always output a decimal point and a number to make CBOR diagnostic notation happy
         * @return String representation
         */
        static String serialize(double value, boolean ecmaMode) {
            // Step 1: Decode the floating point number, and unify normalized and
            // subnormal cases.
            long bits = Double.doubleToLongBits(value);
            int ieeeExponent = (int) ((bits >>> DOUBLE_MANTISSA_BITS) & DOUBLE_EXPONENT_MASK);
            long ieeeMantissa = bits & DOUBLE_MANTISSA_MASK;
            int e2;
            long m2;
            if (ieeeExponent == 0) {
                // Denormal number - no implicit leading 1, and the exponent is 1, not 0.
                e2 = 1 - DOUBLE_EXPONENT_BIAS - DOUBLE_MANTISSA_BITS;
                m2 = ieeeMantissa;
            } else {
                // Add implicit leading 1.
                e2 = ieeeExponent - DOUBLE_EXPONENT_BIAS - DOUBLE_MANTISSA_BITS;
                m2 = ieeeMantissa | (1L << DOUBLE_MANTISSA_BITS);
            }

            boolean sign = bits < 0;
            if (DEBUG) {
                System.out.println("IN=" + Long.toBinaryString(bits));
                System.out.println("   S=" + (sign ? "-" : "+") + " E=" + e2 + " M=" + m2);
            }

            // Step 2: Determine the interval of legal decimal representations.
            boolean even = (m2 & 1) == 0;
            final long mv = 4 * m2;
            final long mp = 4 * m2 + 2;
            final int mmShift = ((m2 != (1L << DOUBLE_MANTISSA_BITS)) || (ieeeExponent <= 1)) ? 1 : 0;
            final long mm = 4 * m2 - 1 - mmShift;
            e2 -= 2;

            if (DEBUG) {
                String sv, sp, sm;
                int e10;
                if (e2 >= 0) {
                    sv = BigInteger.valueOf(mv).shiftLeft(e2).toString();
                    sp = BigInteger.valueOf(mp).shiftLeft(e2).toString();
                    sm = BigInteger.valueOf(mm).shiftLeft(e2).toString();
                    e10 = 0;
                } else {
                    BigInteger factor = BigInteger.valueOf(5).pow(-e2);
                    sv = BigInteger.valueOf(mv).multiply(factor).toString();
                    sp = BigInteger.valueOf(mp).multiply(factor).toString();
                    sm = BigInteger.valueOf(mm).multiply(factor).toString();
                    e10 = e2;
                }

                e10 += sp.length() - 1;

                System.out.println("E =" + e10);
                System.out.println("d+=" + sp);
                System.out.println("d =" + sv);
                System.out.println("d-=" + sm);
                System.out.println("e2=" + e2);
            }

            // Step 3: Convert to a decimal power base using 128-bit arithmetic.
            // -1077 = 1 - 1023 - 53 - 2 <= e_2 - 2 <= 2046 - 1023 - 53 - 2 = 968
            long dv, dp, dm;
            final int e10;
            boolean dmIsTrailingZeros = false, dvIsTrailingZeros = false;
            if (e2 >= 0) {
                final int q = Math.max(0, ((e2 * 78913) >>> 18) - 1);
                // k = constant + floor(log_2(5^q))
                final int k = POW5_INV_BITCOUNT + pow5bits(q) - 1;
                final int i = -e2 + q + k;
                dv = mulPow5InvDivPow2(mv, q, i);
                dp = mulPow5InvDivPow2(mp, q, i);
                dm = mulPow5InvDivPow2(mm, q, i);
                e10 = q;
                if (DEBUG) {
                    System.out.println(mv + " * 2^" + e2);
                    System.out.println("V+=" + dp);
                    System.out.println("V =" + dv);
                    System.out.println("V-=" + dm);
                }
                if (DEBUG) {
                    long exact = POW5_INV[q].multiply(BigInteger.valueOf(mv))
                            .shiftRight(-e2 + q + k).longValue();
                    System.out.println(exact + " " + POW5_INV[q].bitCount());
                    if (dv != exact) {
                        throw new IllegalStateException();
                    }
                }

                if (q <= 21) {
                    if (mv % 5 == 0) {
                        dvIsTrailingZeros = multipleOfPowerOf5(mv, q);
                    } else if (even) {
                        dmIsTrailingZeros = multipleOfPowerOf5(mm, q);
                    } else if (multipleOfPowerOf5(mp, q)) {
                        dp--;
                    }
                }
            } else {
                final int q = Math.max(0, ((-e2 * 732923) >>> 20) - 1);
                final int i = -e2 - q;
                final int k = pow5bits(i) - POW5_BITCOUNT;
                final int j = q - k;
                dv = mulPow5divPow2(mv, i, j);
                dp = mulPow5divPow2(mp, i, j);
                dm = mulPow5divPow2(mm, i, j);
                e10 = q + e2;
                if (DEBUG) {
                    System.out.println(mv + " * 5^" + (-e2) + " / 10^" + q);
                }
                if (q <= 1) {
                    dvIsTrailingZeros = true;
                    if (even) {
                        dmIsTrailingZeros = mmShift == 1;
                    } else {
                        dp--;
                    }
                } else if (q < 63) {
                    dvIsTrailingZeros = (mv & ((1L << (q - 1)) - 1)) == 0;
                }
            }
            if (DEBUG) {
                System.out.println("d+=" + dp);
                System.out.println("d =" + dv);
                System.out.println("d-=" + dm);
                System.out.println("e10=" + e10);
                System.out.println("d-10=" + dmIsTrailingZeros);
                System.out.println("d   =" + dvIsTrailingZeros);
                System.out.println("Accept upper=" + even);
                System.out.println("Accept lower=" + even);
            }

            // Step 4: Find the shortest decimal representation in the interval of
            // legal representations.
            //
            // We do some extra work here in order to follow ECMAScript semantics. In
            // particular, that requires printing in scientific format if and only
            // if the exponent is between -6 and 21, and it requires suppressing .0
            //
            // Above, we moved the decimal dot all the way to the right, so now we
            // need to count digits to figure out the correct exponent for scientific
            // notation.
            final int vplength = decimalLength(dp);
            int exp = e10 + vplength - 1;

            // ECMAScript/JCS semantics requires using scientific notation if and only if
            // outside this range.
            boolean scientificNotation = !((exp >= -6) && (exp < 21));

            int removed = 0;

            int lastRemovedDigit = 0;
            long output;
            if (dmIsTrailingZeros || dvIsTrailingZeros) {
                while (dp / 10 > dm / 10) {
                    dmIsTrailingZeros &= dm % 10 == 0;
                    dvIsTrailingZeros &= lastRemovedDigit == 0;
                    lastRemovedDigit = (int) (dv % 10);
                    dp /= 10;
                    dv /= 10;
                    dm /= 10;
                    removed++;
                }
                if (dmIsTrailingZeros && even) {
                    while (dm % 10 == 0) {
                        dvIsTrailingZeros &= lastRemovedDigit == 0;
                        lastRemovedDigit = (int) (dv % 10);
                        dp /= 10;
                        dv /= 10;
                        dm /= 10;
                        removed++;
                    }
                }
                if (dvIsTrailingZeros && (lastRemovedDigit == 5) && (dv % 2 == 0)) {
                    // Round even if the exact numbers is .....50..0.
                    lastRemovedDigit = 4;
                }
                output = dv
                        + ((dv == dm && !(dmIsTrailingZeros && even))
                                || (lastRemovedDigit >= 5) ? 1 : 0);
            } else {
                while (dp / 10 > dm / 10) {
                    lastRemovedDigit = (int) (dv % 10);
                    dp /= 10;
                    dv /= 10;
                    dm /= 10;
                    removed++;
                }
                output = dv + ((dv == dm || (lastRemovedDigit >= 5)) ? 1 : 0);
            }
            int olength = vplength - removed;

            if (DEBUG) {
                System.out.println("LAST_REMOVED_DIGIT=" + lastRemovedDigit);
                System.out.println("VP=" + dp);
                System.out.println("VR=" + dv);
                System.out.println("VM=" + dm);
                System.out.println("O=" + output);
                System.out.println("OLEN=" + olength);
                System.out.println("EXP=" + exp);
            }

            // Step 5: Print the decimal representation.
            // We follow ECMAScript/JCS semantics here.
            char[] result = new char[25]; // becbf647612f3696 required changing to 25
            int index = 0;
            if (sign) {
                result[index++] = '-';
            }
            if (scientificNotation) {
                // Print in the format x.xxxxxE-yy.
                for (int i = 0; i < olength - 1; i++) {
                    int c = (int) (output % 10);
                    output /= 10;
                    result[index + olength - i] = (char) ('0' + c);
                }
                result[index] = (char) ('0' + output % 10);
                if (olength > 1) {
                    result[index + 1] = '.';
                } else {
                    if (ecmaMode) {
                        // If there are no decimals, suppress .0
                        index--;
                    } else {
                        result[++index] = '.';
                        result[index + 1] = '0';
                    }
                }
                index += olength + 1;
                // Print 'e', the exponent sign, and the exponent, which has at most three digits.
                result[index++] = 'e';
                if (exp < 0) {
                    result[index++] = '-';
                    exp = -exp;
                } else {
                    result[index++] = '+';
                }
                if (exp >= 100) {
                    result[index++] = (char) ('0' + exp / 100);
                    exp %= 100;
                    result[index++] = (char) ('0' + exp / 10);
                } else if (exp >= 10) {
                    result[index++] = (char) ('0' + exp / 10);
                }
                result[index++] = (char) ('0' + exp % 10);
                return new String(result, 0, index);
            } else {
                // Otherwise follow the ECMAScript spec.
                if (exp < 0) {
                    // Decimal dot is before any of the digits.
                    result[index++] = '0';
                    result[index++] = '.';
                    for (int i = -1; i > exp; i--) {
                        result[index++] = '0';
                    }
                    int current = index;
                    for (int i = 0; i < olength; i++) {
                        result[current + olength - i - 1] = (char) ('0' + output % 10);
                        output /= 10;
                        index++;
                    }
                } else if (exp + 1 >= olength) {
                    // Decimal dot is after any of the digits, do not output it in ecmaMode
                    for (int i = 0; i < olength; i++) {
                        result[index + olength - i - 1] = (char) ('0' + output % 10);
                        output /= 10;
                    }
                    index += olength;
                    for (int i = olength; i < exp + 1; i++) {
                        result[index++] = '0';
                    }
                    if (!ecmaMode) {
                        result[index++] = '.';
                        result[index++] = '0';
                    }
                } else {
                    // Decimal dot is somewhere between the digits.
                    int current = index + 1;
                    for (int i = 0; i < olength; i++) {
                        if (olength - i - 1 == exp) {
                            result[current + olength - i - 1] = '.';
                            current--;
                        }
                        result[current + olength - i - 1] = (char) ('0' + output % 10);
                        output /= 10;
                    }
                    index += olength + 1;
                }
                return new String(result, 0, index);
            }
        }

        private static int pow5bits(int e) {
            return ((e * 1217359) >>> 19) + 1;
        }

        private static int decimalLength(long v) {
            if (v >= 1000000000000000000L) return 19;
            if (v >= 100000000000000000L) return 18;
            if (v >= 10000000000000000L) return 17;
            if (v >= 1000000000000000L) return 16;
            if (v >= 100000000000000L) return 15;
            if (v >= 10000000000000L) return 14;
            if (v >= 1000000000000L) return 13;
            if (v >= 100000000000L) return 12;
            if (v >= 10000000000L) return 11;
            if (v >= 1000000000L) return 10;
            if (v >= 100000000L) return 9;
            if (v >= 10000000L) return 8;
            if (v >= 1000000L) return 7;
            if (v >= 100000L) return 6;
            if (v >= 10000L) return 5;
            if (v >= 1000L) return 4;
            if (v >= 100L) return 3;
            if (v >= 10L) return 2;
            return 1;
        }

        private static boolean multipleOfPowerOf5(long value, int q) {
            return pow5Factor(value) >= q;
        }

        private static int pow5Factor(long value) {
            // We want to find the largest power of 5 that divides value.
            if ((value % 5) != 0) return 0;
            if ((value % 25) != 0) return 1;
            if ((value % 125) != 0) return 2;
            if ((value % 625) != 0) return 3;
            int count = 4;
            value /= 625;
            while (value > 0) {
                if (value % 5 != 0) {
                    return count;
                }
                value /= 5;
                count++;
            }
            throw new IllegalArgumentException("" + value);
        }

        /*
         * Compute the high digits of m * 5^p / 10^q = m * 5^(p - q) / 2^q = m * 5^i
         * / 2^j, with q chosen such that m * 5^i / 2^j has sufficiently many
         * decimal digits to represent the original floating point number.
         */
        private static long mulPow5divPow2(long m, int i, int j) {
            // m has at most 55 bits.
            long mHigh = m >>> 31;
            long mLow = m & 0x7fffffff;
            long bits13 = mHigh * POW5_SPLIT[i][0]; // 124
            long bits03 = mLow * POW5_SPLIT[i][0]; // 93
            long bits12 = mHigh * POW5_SPLIT[i][1]; // 93
            long bits02 = mLow * POW5_SPLIT[i][1]; // 62
            long bits11 = mHigh * POW5_SPLIT[i][2]; // 62
            long bits01 = mLow * POW5_SPLIT[i][2]; // 31
            long bits10 = mHigh * POW5_SPLIT[i][3]; // 31
            long bits00 = mLow * POW5_SPLIT[i][3]; // 0
            int actualShift = j - 3 * 31 - 21;
            if (actualShift < 0) {
                throw new IllegalArgumentException("" + actualShift);
            }
            return ((((((((bits00 >>> 31) + bits01 + bits10) >>> 31) + bits02 + bits11) >>> 31)
                    + bits03 + bits12) >>> 21) + (bits13 << 10)) >>> actualShift;
        }

        /*
         * Compute the high digits of m / 5^i / 2^j such that the result is accurate
         * to at least 9 decimal digits. i and j are already chosen appropriately.
         */
        private static long mulPow5InvDivPow2(long m, int i, int j) {
            // m has at most 55 bits.
            long mHigh = m >>> 31;
            long mLow = m & 0x7fffffff;
            long bits13 = mHigh * POW5_INV_SPLIT[i][0];
            long bits03 = mLow * POW5_INV_SPLIT[i][0];
            long bits12 = mHigh * POW5_INV_SPLIT[i][1];
            long bits02 = mLow * POW5_INV_SPLIT[i][1];
            long bits11 = mHigh * POW5_INV_SPLIT[i][2];
            long bits01 = mLow * POW5_INV_SPLIT[i][2];
            long bits10 = mHigh * POW5_INV_SPLIT[i][3];
            long bits00 = mLow * POW5_INV_SPLIT[i][3];

            int actualShift = j - 3 * 31 - 21;
            if (actualShift < 0) {
                throw new IllegalArgumentException("" + actualShift);
            }
            return ((((((((bits00 >>> 31) + bits01 + bits10) >>> 31) + bits02 + bits11) >>> 31)
                    + bits03 + bits12) >>> 21) + (bits13 << 10)) >>> actualShift;
        }
    }


    private static String decodeString(String token) {
      StringBuilder decoded = new StringBuilder();
      for (int index = 1; index < token.length() - 1; index++) {
        char character = token.charAt(index);
        if (character < 0x20) return null;
        if (character != '\\') {
          decoded.append(character);
          continue;
        }
        if (++index >= token.length() - 1) return null;
        char escape = token.charAt(index);
        switch (escape) {
          case '"', '\\', '/' -> decoded.append(escape);
          case 'b' -> decoded.append('\b');
          case 'f' -> decoded.append('\f');
          case 'n' -> decoded.append('\n');
          case 'r' -> decoded.append('\r');
          case 't' -> decoded.append('\t');
          case 'u' -> {
            if (index + 4 >= token.length()) return null;
            try {
              decoded.append((char) Integer.parseInt(token.substring(index + 1, index + 5), 16));
            } catch (NumberFormatException exception) {
              return null;
            }
            index += 4;
          }
          default -> { return null; }
        }
      }
      for (int index = 0; index < decoded.length(); index++) {
        char character = decoded.charAt(index);
        if (Character.isHighSurrogate(character)) {
          if (index + 1 >= decoded.length() || !Character.isLowSurrogate(decoded.charAt(index + 1))) return null;
          index++;
        } else if (Character.isLowSurrogate(character)) return null;
      }
      return decoded.toString();
    }

    private static String canonicalString(String value) {
      StringBuilder canonical = new StringBuilder("\"");
      for (int index = 0; index < value.length(); index++) {
        char character = value.charAt(index);
        switch (character) {
          case '"' -> canonical.append("\\\"");
          case '\\' -> canonical.append("\\\\");
          case '\b' -> canonical.append("\\b");
          case '\f' -> canonical.append("\\f");
          case '\n' -> canonical.append("\\n");
          case '\r' -> canonical.append("\\r");
          case '\t' -> canonical.append("\\t");
          default -> {
            if (character < 0x20) canonical.append(String.format("\\u%04x", (int) character));
            else canonical.append(character);
          }
        }
      }
      return canonical.append('"').toString();
    }
  }

  public record ModelChatResponse(
      String requestId,
      String conversationId,
      AgentMessage message,
      PendingCodexTurn pendingTurn,
      Usage usage,
      String rawProvider,
      StructuredError error,
      Boolean idempotentReplay) {
    public ModelChatResponse(
        String requestId,
        String conversationId,
        AgentMessage message,
        Usage usage,
        String rawProvider,
        StructuredError error) {
      this(requestId, conversationId, message, null, usage, rawProvider, error, null);
    }

    public ModelChatResponse {
      int outcomes = (message == null ? 0 : 1) + (pendingTurn == null ? 0 : 1) + (error == null ? 0 : 1);
      if (outcomes != 1) {
        throw new IllegalArgumentException("exactly one of message, pendingTurn, or error is required");
      }
    }
  }

  public record ToolCallRequest(
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String toolCallId,
      String toolName,
      Map<String, Object> arguments,
      String catalogVersion,
      String catalogHash,
      String idempotencyKey,
      String approvalToken) {}

  public record ToolCallResponse(
      String requestId,
      String conversationId,
      String toolCallId,
      String toolName,
      Object result,
      String status,
      Boolean idempotentReplay,
      StructuredError error,
      String provenance) {}

  public record ToolCancelRequest(String requestId, String toolCallId) {}

  public record ToolCancelResponse(String requestId, String toolCallId, boolean cancelled) {}

  public record TraceEvent(
      String traceId,
      String spanId,
      String parentSpanId,
      String requestId,
      String conversationId,
      String taskId,
      String userId,
      String tenantId,
      String agentId,
      String runtime,
      String eventType,
      String name,
      Map<String, Object> attributes,
      String status,
      String errorClass,
      String errorMessage,
      long startTime,
      Long endTime,
      Long durationMs,
      Integer promptTokens,
      Integer completionTokens,
      Integer cacheReadTokens,
      Integer cacheWriteTokens,
      Integer costUsdMicros,
      Boolean redacted) {}
}
