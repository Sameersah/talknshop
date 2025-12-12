"""
Prompt templates for Bedrock/Claude agent nodes.

Contains carefully crafted prompts for each LLM-powered decision node.
"""

# =============================================================================
# NeedMediaOps Prompt
# =============================================================================

NEED_MEDIA_OPS_PROMPT = """You are analyzing a user's request to determine if media processing is needed.

User Message: {message}

Media Attached:
{media_info}

Your task is to decide whether to process any attached media (audio transcription or image analysis).

Rules:
1. If there is audio attached, we MUST transcribe it to understand the user's spoken request
2. If there is an image attached AND the user seems to be describing a product or asking about something visual, we should analyze it
3. If the text message is already clear and complete, we can skip media processing

Respond ONLY with valid JSON in this exact format:
{{
  "need_stt": true/false,
  "need_vision": true/false,
  "reasoning": "brief explanation"
}}

Examples:
- User says "I want a laptop" with an image of a laptop → {{"need_stt": false, "need_vision": true, "reasoning": "Image may contain specific model or features"}}
- User attaches audio file → {{"need_stt": true, "need_vision": false, "reasoning": "Audio contains user's spoken request"}}
- User types clear text message, no media → {{"need_stt": false, "need_vision": false, "reasoning": "Text is clear, no media to process"}}

Now analyze and respond:"""

# =============================================================================
# BuildRequirementSpec Prompt
# =============================================================================

BUILD_REQUIREMENT_SPEC_PROMPT = """You are a product requirement extraction expert. Your task is to convert natural language into a structured product search specification.

User Request: {message}

{transcript_section}

{image_attrs_section}

Previous RequirementSpec (if any): {current_spec}

Your task is to extract or update the product requirements. Focus on:
1. Product Type: What category of product (laptop, phone, shoes, etc.)
2. Attributes: Specific features (RAM, storage, size, color, brand, etc.)
3. Price Constraints: Budget or price range
4. Quality Filters: Ratings, condition (new/used), reviews
5. Brand Preferences: Specific brands or "no preference"

IMPORTANT:
- If this is an UPDATE (current_spec exists), MERGE new information with existing
- Don't remove information unless explicitly contradicted
- Be specific with measurements and numbers
- If unsure about a value, omit it rather than guessing

Respond ONLY with valid JSON in this exact format:
{{
  "product_type": "laptop",
  "attributes": {{
    "ram_gb": ">=16",
    "storage_gb": ">=512",
    "screen_size": "15-17 inch",
    "processor": "Intel i7 or AMD Ryzen 7"
  }},
  "price": {{
    "max": 1200,
    "currency": "USD"
  }},
  "brand_preferences": ["Apple", "Dell", "Lenovo"],
  "rating_min": 4.2,
  "condition": "new"
}}

Now extract the requirement spec:"""

# Backwards compatibility alias for existing imports
BUILD_REQUIREMENT_PROMPT = BUILD_REQUIREMENT_SPEC_PROMPT

# =============================================================================
# NeedClarify Prompt
# =============================================================================

NEED_CLARIFY_PROMPT = """You are evaluating whether we have enough information to search for products.

RequirementSpec so far:
{requirement_spec}

Clarification Count: {clarification_count} (max allowed: 2)

Evaluate if we can proceed with search:
- Do we know the PRODUCT TYPE clearly?
- Do we have AT LEAST ONE meaningful constraint (price, brand, key feature)?
- Have we already asked {clarification_count} clarifying questions?

Guidelines:
1. We MUST have a clear product type to search
2. We should have at least price range OR brand OR one key feature
3. Don't ask for clarification if we already have sufficient info
4. Don't exceed 2 clarifying questions
5. If user gave detailed info, proceed to search even if some details missing

Respond ONLY with valid JSON:
{{
  "needs_clarification": true/false,
  "reason": "brief explanation of what's missing or why we can proceed",
  "confidence": 0.0-1.0
}}

Examples:
- "laptop under $1000" → {{"needs_clarification": false, "reason": "Have product type and price", "confidence": 0.9}}
- "I want something" → {{"needs_clarification": true, "reason": "Product type unclear", "confidence": 0.3}}
- "laptop with good specs" + already asked 2 questions → {{"needs_clarification": false, "reason": "Max clarifications reached, proceeding with available info", "confidence": 0.6}}

Now evaluate:"""

# =============================================================================
# AskClarifyingQ Prompt
# =============================================================================

ASK_CLARIFYING_Q_PROMPT = """You are a helpful shopping assistant asking a clarifying question.

User's Request: {message}

Current RequirementSpec: {requirement_spec}

What's Missing/Unclear: {clarification_reason}

Clarification Count: {clarification_count} of 2

Your task is to ask ONE specific, helpful question to fill in the most important missing information.

Guidelines:
1. Ask about the MOST IMPORTANT missing piece (product type > price > key feature)
2. Keep it conversational and friendly
3. Provide a few example options if helpful
4. Don't ask multiple questions at once
5. Make it easy for user to answer briefly

Examples:
Good: "What's your budget for the laptop?"
Good: "Are you looking for new or used condition?"
Good: "Any preferred brands? (e.g., Apple, Dell, HP)"

Bad: "What are all the specifications you need?" (too broad)
Bad: "Do you want 16GB RAM, SSD storage, and dedicated graphics?" (multiple questions)

Respond ONLY with valid JSON:
{{
  "question": "Your clarifying question here",
  "suggestions": ["option 1", "option 2", "option 3"],
  "context": "brief explanation of why asking this"
}}

Now generate a clarifying question:"""

# =============================================================================
# Ranking Explanation Prompt
# =============================================================================

RANKING_EXPLANATION_PROMPT = """Explain briefly why this product is ranked in this position.

Product: {product_title}
Price: ${product_price}
Rating: {product_rating}/5
Position: #{rank}

User Requirements:
- Budget: ${budget_max}
- Minimum Rating: {rating_min}
- Preferences: {preferences}

Generate a brief, friendly explanation (1-2 sentences) for why this product is ranked here.

Examples:
- "Great value at $899 with 4.5★ rating, well within your budget"
- "Top rated (4.8★) option from your preferred brand Apple"
- "Best price for these specs, though slightly lower rating"

Explanation:"""


def format_media_info(media: list) -> str:
    """Format media information for prompts."""
    if not media:
        return "No media attached"
    
    media_types = [m.get("media_type", "unknown") for m in media]
    return f"Attached: {', '.join(media_types)} ({len(media)} files)"


def format_transcript_section(transcript: str) -> str:
    """Format transcript section for prompts."""
    if not transcript:
        return ""
    return f"\nTranscribed Audio:\n{transcript}\n"


def format_image_attrs_section(image_attrs: dict) -> str:
    """Format image attributes section for prompts."""
    if not image_attrs:
        return ""
    
    labels = image_attrs.get("labels", [])
    text = image_attrs.get("text", [])
    
    parts = []
    if labels:
        parts.append(f"Image Labels: {', '.join(labels[:10])}")
    if text:
        parts.append(f"Text in Image: {', '.join(text[:5])}")
    
    if not parts:
        return ""
    
    return "\nImage Analysis:\n" + "\n".join(parts) + "\n"


def format_requirement_spec(spec: dict) -> str:
    """Format requirement spec for prompts."""
    if not spec:
        return "None (this is the first extraction)"
    
    import json
    return json.dumps(spec, indent=2)






