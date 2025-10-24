"""
Enhanced characteristic extraction service using LLM and AWS services.
This service intelligently extracts detailed characteristics from media content.
"""

import json
import base64
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import asyncio

# Ollama imports
try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

logger = logging.getLogger(__name__)


class ItemType(str, Enum):
    """Supported item types for characteristic extraction"""
    SHOE = "shoe"
    CLOTHING = "clothing"
    BOTTLE = "bottle"
    ELECTRONICS = "electronics"
    FURNITURE = "furniture"
    BAG = "bag"
    WATCH = "watch"
    JEWELRY = "jewelry"
    BOOK = "book"
    TOY = "toy"
    UNKNOWN = "unknown"


@dataclass
class Characteristic:
    """Represents a characteristic of an item"""
    name: str
    value: str
    confidence: float
    category: str  # e.g., "color", "brand", "material", "size"


@dataclass
class ExtractedCharacteristics:
    """Container for all extracted characteristics"""
    item_type: ItemType
    primary_item: str
    characteristics: List[Characteristic]
    confidence_score: float
    extraction_method: str  # "aws_only", "llm_enhanced", "hybrid"


class CharacteristicExtractor:
    """Enhanced characteristic extraction using Ollama and AWS services"""
    
    def __init__(self, 
                 ollama_model: str = "llava:7b",
                 ollama_host: str = "http://localhost:11434"):
        self.ollama_model = ollama_model
        self.ollama_host = ollama_host
        self.ollama_available = OLLAMA_AVAILABLE
        
        if self.ollama_available:
            try:
                # Test Ollama connection
                models = ollama.list()
                logger.info(f"Ollama connected successfully with {len(models.models)} models")
            except Exception as e:
                logger.warning(f"Ollama connection failed: {e}")
                self.ollama_available = False
    
    def _determine_item_type(self, aws_labels: List[Any]) -> ItemType:
        """Determine item type from AWS labels"""
        label_names = []
        for label in aws_labels:
            if hasattr(label, 'name'):
                label_names.append(label.name.lower())
            elif isinstance(label, dict):
                label_names.append(label.get('name', '').lower())
            else:
                # Handle mock objects or other types
                try:
                    label_names.append(getattr(label, 'name', str(label)).lower())
                except:
                    label_names.append(str(label).lower())
        
        # Shoe detection
        shoe_keywords = ['shoe', 'sneaker', 'boot', 'sandal', 'heel', 'running shoe', 'athletic shoe']
        if any(keyword in ' '.join(label_names) for keyword in shoe_keywords):
            return ItemType.SHOE
        
        # Clothing detection
        clothing_keywords = ['shirt', 'pants', 'dress', 'jacket', 'coat', 'sweater', 't-shirt', 'jeans']
        if any(keyword in ' '.join(label_names) for keyword in clothing_keywords):
            return ItemType.CLOTHING
        
        # Bottle detection
        bottle_keywords = ['bottle', 'container', 'drink', 'water bottle', 'plastic bottle']
        if any(keyword in ' '.join(label_names) for keyword in bottle_keywords):
            return ItemType.BOTTLE
        
        # Electronics detection
        electronics_keywords = ['phone', 'computer', 'laptop', 'monitor', 'tablet', 'electronic']
        if any(keyword in ' '.join(label_names) for keyword in electronics_keywords):
            return ItemType.ELECTRONICS
        
        # Furniture detection
        furniture_keywords = ['chair', 'table', 'sofa', 'desk', 'bed', 'furniture']
        if any(keyword in ' '.join(label_names) for keyword in furniture_keywords):
            return ItemType.FURNITURE
        
        return ItemType.UNKNOWN
    
    def _get_characteristic_prompts(self, item_type: ItemType) -> Dict[str, str]:
        """Get LLM prompts for different item types"""
        prompts = {
            ItemType.SHOE: """
            Analyze this image of a shoe and extract detailed characteristics. Focus on:
            - Brand (Nike, Adidas, Puma, etc.)
            - Color (primary and secondary colors)
            - Material (leather, canvas, synthetic, etc.)
            - Style (sneaker, boot, sandal, etc.)
            - Size indicators if visible
            - Condition (new, used, worn)
            - Special features (laces, zippers, etc.)
            - Sport type if applicable (running, basketball, etc.)
            """,
            
            ItemType.CLOTHING: """
            Analyze this image of clothing and extract detailed characteristics. Focus on:
            - Brand (Nike, Adidas, Zara, etc.)
            - Color (primary and secondary colors)
            - Material (cotton, polyester, wool, etc.)
            - Style (casual, formal, sporty, etc.)
            - Size indicators if visible
            - Condition (new, used, worn)
            - Pattern (solid, striped, printed, etc.)
            - Fit type (slim, regular, loose, etc.)
            """,
            
            ItemType.BOTTLE: """
            Analyze this image of a bottle and extract detailed characteristics. Focus on:
            - Brand (Coca-Cola, Pepsi, etc.)
            - Color (transparent, colored, etc.)
            - Material (plastic, glass, metal, etc.)
            - Size/capacity if visible
            - Content type (water, soda, juice, etc.)
            - Condition (new, used, empty, etc.)
            - Special features (cap type, shape, etc.)
            - Sustainability indicators (recyclable, etc.)
            """,
            
            ItemType.ELECTRONICS: """
            Analyze this image of electronics and extract detailed characteristics. Focus on:
            - Brand (Apple, Samsung, Dell, etc.)
            - Model if visible
            - Color (black, white, silver, etc.)
            - Material (plastic, metal, glass, etc.)
            - Size/dimensions if visible
            - Condition (new, used, damaged, etc.)
            - Type (phone, laptop, tablet, etc.)
            - Special features (camera, ports, etc.)
            """,
            
            ItemType.FURNITURE: """
            Analyze this image of furniture and extract detailed characteristics. Focus on:
            - Brand if visible
            - Color (wood, painted, etc.)
            - Material (wood, metal, plastic, etc.)
            - Style (modern, traditional, etc.)
            - Size indicators if visible
            - Condition (new, used, worn, etc.)
            - Type (chair, table, sofa, etc.)
            - Special features (cushions, wheels, etc.)
            """
        }
        
        return prompts.get(item_type, """
        Analyze this image and extract detailed characteristics. Focus on:
        - Brand if visible
        - Color
        - Material
        - Style
        - Size if visible
        - Condition
        - Special features
        """)
    
    def _convert_aws_results_to_serializable(self, aws_results: Dict[str, Any]) -> Dict[str, Any]:
        """Convert AWS results to JSON serializable format"""
        serializable = {}
        
        # Convert labels
        if 'labels' in aws_results:
            serializable['labels'] = []
            for label in aws_results['labels']:
                if hasattr(label, 'name') and hasattr(label, 'confidence'):
                    serializable['labels'].append({
                        'name': label.name,
                        'confidence': label.confidence
                    })
                elif isinstance(label, dict):
                    serializable['labels'].append(label)
                else:
                    # Handle mock objects or other types
                    try:
                        serializable['labels'].append({
                            'name': getattr(label, 'name', str(label)),
                            'confidence': getattr(label, 'confidence', 0.5)
                        })
                    except:
                        serializable['labels'].append(str(label))
        
        # Convert text detections
        if 'text_detections' in aws_results:
            serializable['text_detections'] = []
            for text in aws_results['text_detections']:
                if hasattr(text, 'text') and hasattr(text, 'confidence'):
                    serializable['text_detections'].append({
                        'text': text.text,
                        'confidence': text.confidence
                    })
                elif isinstance(text, dict):
                    serializable['text_detections'].append(text)
                else:
                    # Handle mock objects or other types
                    try:
                        serializable['text_detections'].append({
                            'text': getattr(text, 'text', str(text)),
                            'confidence': getattr(text, 'confidence', 0.5)
                        })
                    except:
                        serializable['text_detections'].append(str(text))
        
        # Convert objects
        if 'objects' in aws_results:
            serializable['objects'] = []
            for obj in aws_results['objects']:
                if hasattr(obj, 'name') and hasattr(obj, 'confidence'):
                    serializable['objects'].append({
                        'name': obj.name,
                        'confidence': obj.confidence
                    })
                elif isinstance(obj, dict):
                    serializable['objects'].append(obj)
                else:
                    # Handle mock objects or other types
                    try:
                        serializable['objects'].append({
                            'name': getattr(obj, 'name', str(obj)),
                            'confidence': getattr(obj, 'confidence', 0.5)
                        })
                    except:
                        serializable['objects'].append(str(obj))
        
        return serializable
    
    async def extract_characteristics_with_llm(
        self, 
        image_base64: str, 
        aws_results: Dict[str, Any],
        item_type: ItemType
    ) -> ExtractedCharacteristics:
        """Extract characteristics using Ollama with vision capabilities"""
        
        if not self.ollama_available:
            # Fallback to AWS-only extraction
            return await self._extract_aws_only_characteristics(aws_results, item_type)
        
        try:
            # Create a concise prompt for keyword-based analysis
            analysis_prompt = f"""
Analyze this image and extract key characteristics for this {item_type.value}.

Provide ONLY keywords and short phrases, not long descriptions. Format as:

1. **Brand/Manufacturer**: [brand name or "unknown"]
2. **Color**: [primary color, secondary color]
3. **Material**: [material type]
4. **Size**: [size indicator or "unknown"]
5. **Style**: [style keywords]
6. **Condition**: [new/used/damaged]
7. **Features**: [key features separated by commas]
8. **Use Case**: [primary use]
9. **Target**: [target audience keywords]
10. **Price Range**: [budget/mid-range/premium/unknown]

Keep responses SHORT and KEYWORD-FOCUSED. Use commas to separate multiple values.
"""
            
            # Get Ollama response with image
            response = ollama.chat(
                model=self.ollama_model,
                messages=[{
                    'role': 'user',
                    'content': analysis_prompt,
                    'images': [image_base64]  # Pass the actual image to the vision model
                }],
                options={
                    'temperature': 0.1,
                    'top_p': 0.9,
                    'num_predict': 2000
                }
            )
            
            # Parse the response
            characteristics = self._parse_llm_response(response.message.content, item_type)
            
            # Determine primary item from the analysis
            primary_item = self._extract_primary_item_from_response(response.message.content, item_type)
            
            return ExtractedCharacteristics(
                item_type=item_type,
                primary_item=primary_item,
                characteristics=characteristics,
                confidence_score=0.85,  # Vision model confidence
                extraction_method="ollama_vision_enhanced"
            )
            
        except Exception as e:
            logger.error(f"Ollama vision extraction failed: {e}")
            # Fallback to AWS-only
            return await self._extract_aws_only_characteristics(aws_results, item_type)
    
    def _extract_primary_item_from_response(self, response: str, item_type: ItemType) -> str:
        """Extract primary item name from LLM response"""
        try:
            # Look for brand or manufacturer mentions in the response
            lines = response.split('\n')
            for line in lines:
                if '**Brand/Manufacturer**' in line or '**brand**' in line.lower():
                    # Extract the brand name from the line
                    if ':' in line:
                        parts = line.split(':', 1)
                        if len(parts) > 1:
                            brand_text = parts[1].strip()
                            # Clean up the brand text
                            if '(confidence level:' in brand_text:
                                brand_text = brand_text.split('(confidence level:')[0].strip()
                            if brand_text and brand_text.lower() not in ['unknown', 'not visible', 'not clearly visible']:
                                return brand_text.title()
            
            # Look for "owala" in the response (from AWS text detection)
            if 'owala' in response.lower():
                return 'Owala'
            
            # Fallback to item type
            return item_type.value.title()
        except Exception as e:
            logger.warning(f"Could not extract primary item: {e}")
            return item_type.value.title()
    
    def _parse_llm_response(self, response: str, item_type: ItemType) -> List[Characteristic]:
        """Parse LLM response into structured characteristics"""
        characteristics = []
        
        # Parse structured response with numbered items
        lines = response.split('\n')
        
        for line in lines:
            line = line.strip()
            if line.startswith(('1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.', '10.')):
                # Extract characteristic from numbered line
                char = self._parse_numbered_line(line)
                if char:
                    characteristics.append(char)
        
        return characteristics
    
    def _parse_numbered_line(self, line: str) -> Optional[Characteristic]:
        """Parse a numbered line from the LLM response"""
        try:
            # Remove the number prefix
            if '. **' in line:
                # Format: "1. **Brand/Manufacturer**: value (confidence level: 0.8)."
                parts = line.split('**', 1)
                if len(parts) > 1:
                    name_part = parts[1].split('**:', 1)
                    if len(name_part) > 1:
                        name = name_part[0].strip()
                        value_part = name_part[1].strip()
                        
                        # Extract value and confidence
                        if 'confidence level:' in value_part.lower():
                            # Split on "Confidence Level:" (case insensitive)
                            parts = value_part.split('Confidence Level:', 1)
                            if len(parts) > 1:
                                value = parts[0].strip().rstrip('.').strip()
                                conf_part = parts[1].strip()
                                try:
                                    confidence = float(conf_part)
                                except:
                                    confidence = 0.8
                            else:
                                value = value_part.rstrip('.').strip()
                                confidence = 0.8
                        else:
                            value = value_part.rstrip('.').strip()
                            confidence = 0.8
                        
                        # Clean up the value
                        if value.endswith('.'):
                            value = value[:-1]
                        
                        # Determine category
                        category = self._categorize_characteristic(name, ItemType.UNKNOWN)
                        
                        return Characteristic(
                            name=name,
                            value=value,
                            confidence=confidence,
                            category=category
                        )
        except Exception as e:
            logger.warning(f"Could not parse line: {line} - {e}")
        
        return None
    
    def _extract_brand_from_response(self, response: str) -> Optional[str]:
        """Extract brand from response"""
        response_lower = response.lower()
        
        # Look for brand indicators
        if 'owala' in response_lower:
            return 'Owala'
        
        # Look for other brand patterns
        brand_patterns = ['brand', 'manufacturer', 'company', 'label']
        for pattern in brand_patterns:
            if pattern in response_lower:
                # Try to extract text around the pattern
                words = response.split()
                for i, word in enumerate(words):
                    if pattern in word.lower():
                        # Look for capitalized words nearby
                        for j in range(max(0, i-3), min(len(words), i+4)):
                            if words[j][0].isupper() and len(words[j]) > 2:
                                return words[j]
        
        return None
    
    def _extract_colors_from_response(self, response: str) -> List[str]:
        """Extract colors from response"""
        colors = []
        response_lower = response.lower()
        
        # Common color keywords
        color_keywords = [
            'purple', 'orange', 'blue', 'black', 'white', 'red', 'green', 
            'yellow', 'pink', 'brown', 'gray', 'grey', 'silver', 'gold'
        ]
        
        for color in color_keywords:
            if color in response_lower:
                colors.append(color.title())
        
        return colors
    
    def _extract_material_from_response(self, response: str) -> Optional[str]:
        """Extract material from response"""
        response_lower = response.lower()
        
        # Material keywords
        material_keywords = [
            'plastic', 'glass', 'metal', 'steel', 'aluminum', 'rubber',
            'silicone', 'fabric', 'leather', 'wood', 'ceramic'
        ]
        
        for material in material_keywords:
            if material in response_lower:
                return material.title()
        
        return None
    
    def _extract_style_from_response(self, response: str) -> Optional[str]:
        """Extract style from response"""
        response_lower = response.lower()
        
        # Style keywords
        style_keywords = [
            'cylindrical', 'round', 'square', 'rectangular', 'oval',
            'modern', 'classic', 'sporty', 'elegant', 'minimalist'
        ]
        
        for style in style_keywords:
            if style in response_lower:
                return style.title()
        
        return None
    
    def _extract_features_from_response(self, response: str) -> List[str]:
        """Extract special features from response"""
        features = []
        response_lower = response.lower()
        
        # Feature keywords
        feature_keywords = [
            'screw-on cap', 'twist mechanism', 'strap', 'label', 'logo',
            'handle', 'spout', 'filter', 'insulated', 'leak-proof'
        ]
        
        for feature in feature_keywords:
            if feature in response_lower:
                features.append(feature.title())
        
        return features
    
    def _extract_use_case_from_response(self, response: str) -> Optional[str]:
        """Extract use case from response"""
        response_lower = response.lower()
        
        # Use case keywords
        use_case_keywords = [
            'water bottle', 'drinking', 'hydration', 'outdoor', 'sports',
            'fitness', 'travel', 'daily use', 'exercise'
        ]
        
        for use_case in use_case_keywords:
            if use_case in response_lower:
                return use_case.title()
        
        return None
    
    def _categorize_characteristic(self, key: str, item_type: ItemType) -> str:
        """Categorize characteristics into groups"""
        key_lower = key.lower()
        
        if any(word in key_lower for word in ['brand', 'company', 'manufacturer']):
            return 'brand'
        elif any(word in key_lower for word in ['color', 'colour']):
            return 'color'
        elif any(word in key_lower for word in ['material', 'fabric', 'texture']):
            return 'material'
        elif any(word in key_lower for word in ['size', 'dimension', 'measurement']):
            return 'size'
        elif any(word in key_lower for word in ['style', 'type', 'model']):
            return 'style'
        elif any(word in key_lower for word in ['condition', 'state', 'quality']):
            return 'condition'
        else:
            return 'other'
    
    async def _extract_aws_only_characteristics(
        self, 
        aws_results: Dict[str, Any], 
        item_type: ItemType
    ) -> ExtractedCharacteristics:
        """Extract characteristics using only AWS services"""
        
        characteristics = []
        
        # Extract from labels
        for label in aws_results.get('labels', []):
            if hasattr(label, 'name') and hasattr(label, 'confidence'):
                name = label.name
                confidence = label.confidence / 100.0
            elif isinstance(label, dict):
                name = label.get('name', '')
                confidence = label.get('confidence', 0.0) / 100.0
            else:
                # Handle mock objects or other types
                try:
                    name = getattr(label, 'name', str(label))
                    confidence = getattr(label, 'confidence', 0.0) / 100.0
                except:
                    name = str(label)
                    confidence = 0.0
            
            characteristics.append(Characteristic(
                name="detected_object",
                value=name,
                confidence=confidence,
                category="object"
            ))
        
        # Extract from text
        for text in aws_results.get('text_detections', []):
            if hasattr(text, 'text') and hasattr(text, 'confidence'):
                text_value = text.text
                confidence = text.confidence / 100.0
            elif isinstance(text, dict):
                text_value = text.get('text', '')
                confidence = text.get('confidence', 0.0) / 100.0
            else:
                # Handle mock objects or other types
                try:
                    text_value = getattr(text, 'text', str(text))
                    confidence = getattr(text, 'confidence', 0.0) / 100.0
                except:
                    text_value = str(text)
                    confidence = 0.0
            
            characteristics.append(Characteristic(
                name="detected_text",
                value=text_value,
                confidence=confidence,
                category="text"
            ))
        
        # Get primary item name safely
        primary_item = "Unknown"
        labels = aws_results.get('labels', [])
        if labels:
            first_label = labels[0]
            if hasattr(first_label, 'name'):
                primary_item = first_label.name
            elif isinstance(first_label, dict):
                primary_item = first_label.get('name', 'Unknown')
            else:
                primary_item = str(first_label)
        
        return ExtractedCharacteristics(
            item_type=item_type,
            primary_item=primary_item,
            characteristics=characteristics,
            confidence_score=0.6,  # AWS confidence
            extraction_method="aws_only"
        )
    
    async def extract_characteristics(
        self, 
        image_base64: str, 
        aws_results: Dict[str, Any]
    ) -> ExtractedCharacteristics:
        """Main method to extract characteristics"""
        
        # Determine item type
        item_type = self._determine_item_type(aws_results.get('labels', []))
        
        # Try Ollama extraction first if available
        if self.ollama_available:
            return await self.extract_characteristics_with_llm(
                image_base64, aws_results, item_type
            )
        else:
            return await self._extract_aws_only_characteristics(aws_results, item_type)


class AudioCharacteristicExtractor:
    """Extract characteristics from audio content using Ollama"""
    
    def __init__(self, 
                 ollama_model: str = "llava:7b",
                 ollama_host: str = "http://localhost:11434"):
        self.ollama_model = ollama_model
        self.ollama_host = ollama_host
        self.ollama_available = OLLAMA_AVAILABLE
        
        if self.ollama_available:
            try:
                # Test Ollama connection
                models = ollama.list()
                logger.info(f"Audio Ollama connected successfully with {len(models.models)} models")
            except Exception as e:
                logger.warning(f"Audio Ollama connection failed: {e}")
                self.ollama_available = False
    
    async def extract_audio_characteristics(
        self, 
        transcript: str, 
        audio_metadata: Dict[str, Any]
    ) -> List[Characteristic]:
        """Extract characteristics from audio transcript using Ollama"""
        
        characteristics = []
        
        # Basic characteristics from transcript
        characteristics.append(Characteristic(
            name="language",
            value=self._detect_language(transcript),
            confidence=0.9,
            category="linguistic"
        ))
        
        characteristics.append(Characteristic(
            name="sentiment",
            value=self._analyze_sentiment(transcript),
            confidence=0.7,
            category="emotional"
        ))
        
        characteristics.append(Characteristic(
            name="speaker_count",
            value=str(audio_metadata.get('speaker_count', 1)),
            confidence=0.8,
            category="technical"
        ))
        
        # Extract product mentions
        product_mentions = self._extract_product_mentions(transcript)
        for product in product_mentions:
            characteristics.append(Characteristic(
                name="mentioned_product",
                value=product,
                confidence=0.8,
                category="content"
            ))
        
        # Enhanced analysis with Ollama if available
        if self.ollama_available:
            try:
                enhanced_characteristics = await self._extract_enhanced_audio_characteristics(transcript)
                characteristics.extend(enhanced_characteristics)
            except Exception as e:
                logger.warning(f"Enhanced audio analysis failed: {e}")
        
        return characteristics
    
    async def _extract_enhanced_audio_characteristics(self, transcript: str) -> List[Characteristic]:
        """Extract enhanced characteristics using Ollama"""
        try:
            prompt = f"""
Analyze this audio transcript and extract detailed characteristics:

Transcript: "{transcript}"

Extract the following characteristics:
1. Customer intent (what they're looking for)
2. Product preferences (brand, color, size, style)
3. Budget range if mentioned
4. Use case or occasion
5. Emotional tone and sentiment
6. Any specific requirements or constraints
7. Urgency level (immediate need vs browsing)
8. Decision stage (researching, comparing, ready to buy)

Return the characteristics in a structured format.
"""
            
            response = ollama.chat(
                model=self.ollama_model,
                messages=[{
                    'role': 'user',
                    'content': prompt
                }],
                options={
                    'temperature': 0.2,
                    'top_p': 0.9,
                    'num_predict': 800
                }
            )
            
            # Parse the response into characteristics
            enhanced_characteristics = self._parse_audio_llm_response(response.message.content)
            return enhanced_characteristics
            
        except Exception as e:
            logger.error(f"Enhanced audio analysis failed: {e}")
            return []
    
    def _parse_audio_llm_response(self, response: str) -> List[Characteristic]:
        """Parse Ollama response for audio characteristics"""
        characteristics = []
        
        # Simple parsing - extract key information
        lines = response.split('\n')
        
        for line in lines:
            line = line.strip()
            if ':' in line and len(line) > 10:
                try:
                    key, value = line.split(':', 1)
                    key = key.strip().lower().replace(' ', '_')
                    value = value.strip()
                    
                    if value and len(value) > 2:
                        characteristics.append(Characteristic(
                            name=key,
                            value=value,
                            confidence=0.75,
                            category="enhanced_analysis"
                        ))
                except:
                    continue
        
        return characteristics
    
    def _detect_language(self, text: str) -> str:
        """Simple language detection"""
        # This is a simplified version - in production, use proper language detection
        if any(word in text.lower() for word in ['hello', 'the', 'and', 'is', 'of']):
            return "English"
        elif any(word in text.lower() for word in ['hola', 'el', 'la', 'de']):
            return "Spanish"
        else:
            return "Unknown"
    
    def _analyze_sentiment(self, text: str) -> str:
        """Simple sentiment analysis"""
        positive_words = ['good', 'great', 'excellent', 'amazing', 'love', 'like']
        negative_words = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'poor']
        
        text_lower = text.lower()
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        if positive_count > negative_count:
            return "Positive"
        elif negative_count > positive_count:
            return "Negative"
        else:
            return "Neutral"
    
    def _extract_product_mentions(self, text: str) -> List[str]:
        """Extract product mentions from text"""
        # Simple keyword extraction - in production, use NER
        products = []
        text_lower = text.lower()
        
        product_keywords = [
            'shoe', 'shoes', 'sneaker', 'boot', 'sandal',
            'shirt', 'pants', 'dress', 'jacket',
            'phone', 'laptop', 'computer', 'tablet',
            'bottle', 'drink', 'water', 'soda'
        ]
        
        for keyword in product_keywords:
            if keyword in text_lower:
                products.append(keyword)
        
        return products
