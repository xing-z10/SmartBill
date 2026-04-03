"""
Text parsing module
Extracts structured data from OCR raw text
"""
import re
from typing import List, Optional, Tuple
from models import Item

class ReceiptParser:
    """
    Parses raw OCR text into structured receipt data
    """
    
    # Default tax rate (can be overridden)
    TAX_RATE = 0.08  # 8% default tax rate
    
    # Common store names for detection
    STORE_PATTERNS = [
        r'COSTCO', r'WALMART', r'TARGET', r'WHOLE\s*FOODS',
        r'TRADER\s*JOE', r'SAFEWAY', r'KROGER', r'PUBLIX', r'SPROUTS'
    ]
    
    # Price patterns (matches $12.99, 12.99, $12.99-, etc.)
    PRICE_PATTERN = r'\$?\s*(\d+\.\d{2})\s*-?'
    
    # Total patterns - more flexible to match various formats
    # Important: Use word boundary to avoid matching "SUBTOTAL"
    TOTAL_PATTERNS = [
        r'\bTOTAL\s*:?\s*\$?\s*(\d+\.\d{2})',  # Match "TOTAL" as whole word
        r'\bTOTAL\s+(\d+\.\d{2})',  # Match "TOTAL" followed by space and number
        r'\bAMOUNT\s*DUE\s*:?\s*\$?\s*(\d+\.\d{2})',
        r'\bBALANCE\s*DUE\s+(\d+\.\d{2})',  # "BALANCE DUE 23.31" (Sprouts format)
        r'\bBALANCE\s*:?\s*\$?\s*(\d+\.\d{2})'
    ]
    
    # Subtotal patterns
    SUBTOTAL_PATTERNS = [
        r'SUBTOTAL[\s:]*\$?\s*(\d+\.\d{2})',
        r'SUB[\s-]*TOTAL[\s:]*\$?\s*(\d+\.\d{2})',
        r'BEFORE\s*TAX[\s:]*\$?\s*(\d+\.\d{2})'
    ]
    
    # Tax patterns - match various tax formats
    TAX_PATTERNS = [
        r'SALES\s*TAX\s+\d+\.\d{2}\s+(\d+\.\d{2})',  # "Sales Tax 10.13 0.95" (Sprouts format)
        r'TAX1\s+\d+\.?\d*\s*%\s+(\d+\.\d{2})',  # "TAX1 9.3750 % 0.65"
        r'TAX[\s:]*\$?\s*(\d+\.\d{2})',  # "TAX 0.65" or "TAX: 0.65"
        r'SALES\s*TAX[\s:]*\$?\s*(\d+\.\d{2})',  # "SALES TAX 0.65"
        r'TAX\s*AMOUNT[\s:]*\$?\s*(\d+\.\d{2})'  # "TAX AMOUNT 0.65"
    ]
    
    @classmethod
    def parse(cls, raw_text: str) -> Tuple[List[Item], Optional[float], Optional[str]]:
        """
        Parse raw OCR text into structured data
        
        Args:
            raw_text: Raw text from OCR engine
            
        Returns:
            Tuple of (items_list, total_amount, store_name)
        """
        # Handle escaped newlines (handle both \\\\n and \\n)
        raw_text = raw_text.replace('\\\\n', '\n').replace('\\n', '\n')
        
        # Preprocess text to fix common layout issues (like Sprouts misaligned prices)
        raw_text = cls._fix_sprouts_misalignment(raw_text)
        
        # Detect store name
        store_name = cls._extract_store_name(raw_text)
        
        # Extract items with prices
        items = cls._extract_items(raw_text)
        
        # Extract total if available
        total = cls._extract_total(raw_text)
        
        return items, total, store_name

    @classmethod
    def _fix_sprouts_misalignment(cls, text: str) -> str:
        """
        Fix specific line misalignment issues seen in Sprouts receipts
        where prices shift to the previous line (or category line)
        
        Example issue:
        GROCERY 2.00
        CHOC PB PROTEIN
        1 @ 2 FOR 4.00 2.25
        DRINK-SPRNG-PRBTC-
        
        Should be:
        GROCERY
        CHOC PB PROTEIN 2.00
        1 @ 2 FOR 4.00
        DRINK-SPRNG-PRBTC- 2.25
        """
        lines = text.split('\n')
        new_lines = []
        
        # Buffer to hold a price that needs to be moved to the next valid item line
        floating_price = None
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                new_lines.append(line)
                continue
            
            # Skip metadata lines from processing, just append them
            if cls._is_metadata_line(line) and not cls._looks_like_item_name(line):
                new_lines.append(line)
                continue

            # Regex to capture a price at the end of the line
            # Matches: "TEXT 2.00" -> group 1: "TEXT", group 2: "2.00", group 3: flag
            # Be careful not to match "1 @ 2 FOR 4.00" as a price line (4.00 is part of desc)
            price_match = re.search(r'^(.*?)\s+(\d+\.\d{2})\s*([T|X|N]?)$', line)
            
            # Check for Sprouts specific category lines
            is_category = line.split()[0] in ['GROCERY', 'VITAMINS', 'PRODUCE', 'MEAT', 'DAIRY', 'BAKERY', 'BODY', 'CARE']
            
            # Check for discount lines (e.g. "1 @ 2 FOR 4.00")
            is_discount = '@' in line and 'FOR' in line
            
            if price_match:
                content = price_match.group(1).strip()
                price = price_match.group(2)
                flag = price_match.group(3)
                
                # Case 1: Category line with a price (e.g., "GROCERY 2.00")
                # The price 2.00 actually belongs to the NEXT item
                if is_category:
                    new_lines.append(content) # Keep "GROCERY"
                    floating_price = f"{price} {flag}".strip() # Save "2.00" for later
                    continue
                    
                # Case 2: Discount line with a price (e.g., "1 @ 2 FOR 4.00 2.25")
                # The price 2.25 belongs to the NEXT item
                if is_discount:
                     new_lines.append(content) # Keep "1 @ 2 FOR 4.00"
                     floating_price = f"{price} {flag}".strip()
                     continue
            
            # If we have a floating price and this line looks like an item (and doesn't have a price)
            if floating_price:
                # Check if this line already has a price at the end
                has_price = re.search(r'\d+\.\d{2}\s*[T|X|N]?$', line)
                
                # Don't attach to discount lines or categories
                if not has_price and not is_discount and not is_category:
                    # Append the floating price to this line
                    new_lines.append(f"{line} {floating_price}")
                    floating_price = None
                    continue
            
            # Default: just keep the line
            new_lines.append(line)
            
        return '\n'.join(new_lines)
    
    @classmethod
    def _extract_store_name(cls, text: str) -> Optional[str]:
        """
        Extract store name from receipt text
        
        Args:
            text: Raw receipt text
            
        Returns:
            Store name if found, None otherwise
        """
        text_upper = text.upper()
        
        for pattern in cls.STORE_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                return match.group(0).strip()
        
        return None
    
    @classmethod
    def _extract_items(cls, text: str) -> List[Item]:
        """
        Extract items and prices from receipt text
        Handles multi-line prices, tax indicators (X/N), and voided entries
        
        Args:
            text: Raw receipt text
            
        Returns:
            List of Item objects
        """
        # Handle escaped newlines (\\n -> \n)
        text = text.replace('\\n', '\n')
        
        # Find the start of items section (after "GROCERY" or similar category headers)
        # and end before "Tax Report" or similar sections
        text_upper = text.upper()
        start_idx = 0
        end_idx = len(text.split('\n'))
        
        # Find start: look for "GROCERY" or category headers (only for Sprouts format)
        grocery_match = re.search(r'GROCERY', text_upper)
        if grocery_match:
            # Find the line number where GROCERY appears
            lines_before = text[:grocery_match.end()].count('\n')
            start_idx = lines_before + 1  # Start after the GROCERY line
        
        # Find end: look for "Tax Report" (Sprouts) or "SUBTOTAL"/"TOTAL" (other stores)
        # Be more specific to avoid matching "TAX1" or "TAX" in the middle
        tax_report_match = re.search(r'TAX\s+REPORT', text_upper)
        if tax_report_match:
            # Find the line number where Tax Report appears
            lines_before = text[:tax_report_match.start()].count('\n')
            end_idx = lines_before  # Stop before Tax Report
        else:
            # For other stores, stop before SUBTOTAL or TOTAL line
            # Look for lines that start with SUBTOTAL or TOTAL (not in the middle of text)
            subtotal_match = re.search(r'^\s*SUBTOTAL', text_upper, re.MULTILINE)
            if subtotal_match:
                lines_before = text[:subtotal_match.start()].count('\n')
                end_idx = lines_before  # Stop before SUBTOTAL
        
        items = []
        lines = text.split('\n')
        # Only process lines between start_idx and end_idx
        lines = lines[start_idx:end_idx]
        
        # Debug: log the parsing range
        import logging
        logger = logging.getLogger(__name__)
        all_lines = text.split('\n')
        logger.debug(f"Parsing range: start_idx={start_idx}, end_idx={end_idx}, total_lines={len(all_lines)}")
        logger.debug(f"Lines to parse ({len(lines)}): {lines[:5]}...")
        
        i = 0
        skip_until_void_end = False
        tax_rate_multiplier = None  # Will be extracted from receipt
        
        # First, extract tax rate from receipt if available
        # Try different tax rate formats
        tax_rate_match = re.search(r'TAX1\s+(\d+\.?\d*)\s*%', text.upper())
        if not tax_rate_match:
            # Try Sprouts format: "Sales Tax 10.13 0.95"
            # 10.13 = taxable amount, 0.95 = tax amount
            # Tax rate = 0.95 / 10.13
            sales_tax_match = re.search(r'SALES\s*TAX\s+(\d+\.\d{2})\s+(\d+\.\d{2})', text.upper())
            if sales_tax_match:
                try:
                    taxable_amount = float(sales_tax_match.group(1))
                    tax_amount = float(sales_tax_match.group(2))
                    if taxable_amount > 0:
                        # Calculate tax rate: tax_amount / taxable_amount
                        tax_rate = tax_amount / taxable_amount
                        tax_rate_multiplier = 1 + tax_rate
                    else:
                        tax_rate_multiplier = None
                except (ValueError, IndexError, ZeroDivisionError):
                    tax_rate_multiplier = None
        
        if tax_rate_match and not tax_rate_multiplier:
            try:
                tax_rate_percent = float(tax_rate_match.group(1))
                # If it's a percentage (like 9.375), use it as percentage
                if tax_rate_percent < 1:
                    tax_rate_multiplier = 1 + tax_rate_percent
                else:
                    tax_rate_multiplier = 1 + (tax_rate_percent / 100)
            except (ValueError, IndexError):
                tax_rate_multiplier = None
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty lines
            if not line:
                i += 1
                continue
            
            # Check for VOIDED ENTRY marker
            if 'VOIDED ENTRY' in line.upper() or '** VOIDED' in line.upper():
                skip_until_void_end = True
                i += 1
                # Skip the next line (the voided item itself)
                if i < len(lines):
                    i += 1
                continue
            
            # Skip lines after VOIDED ENTRY until we find the next valid item pattern
            # Skip the voided item line and its price line
            if skip_until_void_end:
                # Check if this is a weight/price line (like "1.000 oz @ 1 oz /5.97 5.97 N")
                if re.search(r'\d+\.\d+\s*(oz|lb|kg|g)\s*@', line.upper()):
                    # This is the price line for the voided item, skip it
                    i += 1
                    skip_until_void_end = False
                    continue
                # Look for a line that looks like a new valid item (has product code and is not voided)
                elif re.search(r'\d{12,}', line):  # Product code pattern
                    # Make sure it's not immediately after voided entry (give it one more check)
                    skip_until_void_end = False
                else:
                    i += 1
                    continue
            
            # Skip payment and metadata lines
            if cls._is_payment_line(line) or cls._is_metadata_line(line):
                i += 1
                continue
            
            # Skip category headers (e.g., "GROCERY", "VITAMINS") - lines without prices
            line_upper = line.upper().strip()
            if line_upper in ['GROCERY', 'VITAMINS', 'PRODUCE', 'MEAT', 'DAIRY', 'BAKERY']:
                i += 1
                continue
            
            # Check if this is a discount/promotion line (e.g., "1 @ 2 FOR 4.00" or "1 @ 4 FOR 9.00")
            # We want to extract the quantity "1" if possible and update the previous item
            discount_match = re.match(r'^(\d+)\s*@\s*\d+\s+FOR\s+\d+\.\d{2}', line)
            if discount_match:
                if items:
                    quantity = int(discount_match.group(1))
                    items[-1].quantity = quantity
                    # The previous item's price might be a total price now because of quantity > 1
                    # Recalculate unit price
                    if quantity > 1 and items[-1].price > 0:
                        items[-1].price = round(items[-1].price / quantity, 2)
                i += 1
                continue
            
            # Check if this is a CRV line (e.g., "*CRV FS/TX 05 0.05 T" or "CRV FS/TX 05")
            # Force standard CRV amount if line matches standard pattern but amount is missing/wrong due to OCR issues
            # Updated regex to match CRV with or without leading asterisk
            crv_match = re.search(r'\*?CRV\s+FS/TX\s+05.*?(\d+\.\d{2})?\s*([TXN]?)', line.upper())
            
            # Special handling for Sprouts CRV misaligned lines where price might be missing
            # If we see "*CRV FS/TX 05" (with or without asterisk) but no price, assume it's 0.05
            if not crv_match or not crv_match.group(1):
                 if "CRV FS/TX 05" in line.upper():
                     # Force it to be treated as a valid match with 0.05
                     # Create a dummy match object-like structure
                     class DummyMatch:
                         def group(self, i):
                             return "0.05" if i == 1 else "T" # Default to Taxable
                     crv_match = DummyMatch()

            if crv_match:
                # This is a CRV fee line, attach to the previous item
                # DO NOT add CRV as a separate item, but add its cost to the previous item
                if items:
                    crv_amount = float(crv_match.group(1))
                    crv_tax_indicator = crv_match.group(2) if crv_match.group(2) else None
                    
                    # Get the last item's base price (should not have tax applied yet)
                    # Note: We need to handle if price was already converted to unit price
                    item_quantity = items[-1].quantity
                    item_unit_price = items[-1].price
                    item_base_total_price = item_unit_price * item_quantity
                    
                    # Check if the item line had T/X indicator
                    item_tax_indicator = None
                    if i > 0:
                        prev_line = lines[i - 1].strip().upper()
                        item_tax_match = re.search(r'\s+([XNT])\s*$', prev_line)
                        if item_tax_match:
                            item_tax_indicator = item_tax_match.group(1)
                    
                    # Calculate item price with tax (if needed)
                    item_total_with_tax = item_base_total_price
                    if item_tax_indicator in ['T', 'X'] and tax_rate_multiplier:
                        item_total_with_tax = item_base_total_price * tax_rate_multiplier
                    
                    # Calculate CRV with tax (if needed)
                    crv_with_tax = crv_amount
                    if crv_tax_indicator in ['T', 'X'] and tax_rate_multiplier:
                        crv_with_tax = crv_amount * tax_rate_multiplier
                    
                    # Total = item (with tax if needed) + CRV (with tax if needed)
                    final_total_price = item_total_with_tax + crv_with_tax
                    
                    # Update price to be unit price
                    if item_quantity > 1:
                        items[-1].price = round(final_total_price / item_quantity, 2)
                    else:
                        items[-1].price = round(final_total_price, 2)
                i += 1
                continue # Skip adding CRV as a new item
                
            # Check if this is a quantity line (e.g., "2 @ 3.99")
            # Updated regex to be more permissive at the end (allow tax flags or trailing spaces)
            quantity_price_match = re.match(r'^(\d+)\s*@\s*(\d+\.\d{2}).*?([XNT])?$', line)
            if quantity_price_match:
                # This is a quantity/price line, update the previous item
                if items:
                    quantity = int(quantity_price_match.group(1))
                    unit_price = float(quantity_price_match.group(2))
                    items[-1].quantity = quantity
                    # Since we have the explicit unit price here, use it directly!
                    # No need to divide total by quantity
                    
                    # Handle tax flag if present in this line
                    tax_flag = quantity_price_match.group(3)
                    if tax_flag in ['X', 'T'] and tax_rate_multiplier:
                        unit_price = unit_price * tax_rate_multiplier
                        
                    items[-1].price = round(unit_price, 2)
                i += 1
                continue

                
                # Try to find price in current line
            price_match = re.search(cls.PRICE_PATTERN, line)
            tax_indicator = None
            
            # Check for tax indicator (X, N, or T) at the end of line
            tax_indicator_match = re.search(r'\s+([XNT])\s*$', line)
            if tax_indicator_match:
                tax_indicator = tax_indicator_match.group(1)
            
            # Pattern 1: Price and item name in same line (e.g., "CHOC PB PROTEIN 2.00" or "ROTH CREAMY ... 3.97 N")
            # Only process lines that have a price (this ensures we skip category headers)
            if price_match:
                price = float(price_match.group(1))
                
                # Extract item name (text before the price)
                name = line[:price_match.start()].strip()
                
                # Skip if this is just a category header or metadata (no meaningful name before price)
                if not name or len(name) < 2:
                    i += 1
                    continue
                
                # Remove tax indicator from name if present
                name = re.sub(r'\s+[XNT]\s*$', '', name).strip()
                
                # Remove product codes and other metadata (12+ digit numbers, single letters like "F")
                name = re.sub(r'\d{12,}', '', name)  # Remove product codes
                name = re.sub(r'\s+[A-Z]\s*$', '', name)  # Remove trailing single letters like "F"
                
                # Clean up item name
                name = cls._clean_item_name(name)
                
                # Skip if name is empty or too short after cleaning
                if not name or len(name) < 2:
                    i += 1
                    continue
                
                # Don't apply tax yet - wait for CRV if it exists
                # Store the tax indicator for later use
                # We'll apply tax after CRV is added (if any)
                
                if name and len(name) > 2 and not cls._is_payment_line(name):
                    # Removed _looks_like_item_name check as it might be too strict
                    # Check for quantity
                    quantity = cls._extract_quantity(name)
                    if quantity > 1:
                        name = re.sub(r'^\d+\s*[xX×]\s*', '', name).strip()
                    
                    # Store item with base price (no tax yet)
                    # We'll apply tax when we process CRV or at the end
                    items.append(Item(
                        name=name,
                        price=price,  # Base price, tax will be applied later if needed
                        quantity=quantity
                    ))
                    
                    # Store tax indicator in a way we can access it later
                    # For now, we'll check the next line for CRV
                    # If no CRV follows, apply tax now
                    # Check if next line is CRV
                    if i + 1 < len(lines):
                        next_line_check = lines[i + 1].strip().upper()
                        if '*CRV' not in next_line_check:
                            # No CRV follows, apply tax now if needed
                            if tax_indicator in ['X', 'T'] and tax_rate_multiplier:
                                price = price * tax_rate_multiplier
                            
                            # Calculate UNIT PRICE if quantity > 1
                            if quantity > 1:
                                items[-1].price = round(price / quantity, 2)
                            else:
                                items[-1].price = round(price, 2)
                    else:
                        # Last line, apply tax now if needed
                        if tax_indicator in ['X', 'T'] and tax_rate_multiplier:
                            price = price * tax_rate_multiplier
                        
                        # Calculate UNIT PRICE if quantity > 1
                        if quantity > 1:
                            items[-1].price = round(price / quantity, 2)
                        else:
                            items[-1].price = round(price, 2)
            
            # Pattern 2: Item name on current line, price on next line
            # This includes weight-based items (e.g., "CHOCOLATE 850041392020 F" followed by "1.000 oz @ 1 oz /5.97 5.97 N")
            elif i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                
                # Check if next line is a weight/price line (e.g., "1.000 oz @ 1 oz /5.97 5.97 N")
                weight_price_match = re.search(r'(\d+\.\d+)\s*(oz|lb|kg|g)\s*@.*?/(\d+\.\d{2})\s+(\d+\.\d{2})\s*([XN]?)', next_line)
                
                if weight_price_match:
                    # This is a weight-based item, price is the last number before X/N
                    price = float(weight_price_match.group(4))  # The second price (actual price)
                    name = line.strip()
                    
                    # Remove product codes and metadata
                    name = re.sub(r'\d{12,}', '', name)  # Remove product codes
                    name = re.sub(r'\s+[A-Z]\s*$', '', name)  # Remove trailing single letters
                    
                    # Check for tax indicator in next line
                    tax_indicator = weight_price_match.group(5) if weight_price_match.group(5) else None
                    
                    # Clean up item name
                    name = cls._clean_item_name(name)
                    
                    # Apply tax multiplier if X or T indicator found (T = taxable)
                    if tax_indicator in ['X', 'T'] and tax_rate_multiplier:
                        price = price * tax_rate_multiplier
                        price = round(price, 2)
                    
                    if name and len(name) > 2 and not cls._is_payment_line(name):
                        quantity = cls._extract_quantity(name)
                        if quantity > 1:
                            name = re.sub(r'^\d+\s*[xX×]\s*', '', name).strip()
                            # Convert total price to unit price
                            price = round(price / quantity, 2)
                        
                        items.append(Item(
                            name=name,
                            price=price,
                            quantity=quantity
                        ))
                        i += 1  # Skip next line as we've processed it
                
                # Pattern 2b: Regular item with price on next line (fallback)
                else:
                    next_price_match = re.search(cls.PRICE_PATTERN, next_line)
                    
                    # Check if current line looks like an item name (has product code pattern or letters)
                    if next_price_match and cls._looks_like_item_name(line):
                        price = float(next_price_match.group(1))
                        name = line.strip()
                        
                        # Remove product codes and metadata
                        name = re.sub(r'\d{12,}', '', name)  # Remove product codes
                        name = re.sub(r'\s+[A-Z]\s*$', '', name)  # Remove trailing single letters
                        
                        # Check for tax indicator in next line (X, N, or T)
                        next_tax_match = re.search(r'\s+([XNT])\s*$', next_line)
                        if next_tax_match:
                            tax_indicator = next_tax_match.group(1)
                        
                        # Clean up item name
                        name = cls._clean_item_name(name)
                        
                        # Apply tax multiplier if X or T indicator found (T = taxable)
                        if tax_indicator in ['X', 'T'] and tax_rate_multiplier:
                            price = price * tax_rate_multiplier
                            price = round(price, 2)
                        
                        if name and len(name) > 2 and not cls._is_payment_line(name):
                            quantity = cls._extract_quantity(name)
                            if quantity > 1:
                                name = re.sub(r'^\d+\s*[xX×]\s*', '', name).strip()
                                # Convert total price to unit price
                                price = round(price / quantity, 2)
                            
                            items.append(Item(
                                name=name,
                                price=price,
                                quantity=quantity
                            ))
                            i += 1  # Skip next line as we've processed it
            
            i += 1
        
        return items
    
    @staticmethod
    def _looks_like_item_name(line: str) -> bool:
        """
        Check if a line looks like an item name (not a price line)
        
        Args:
            line: Text line to check
            
        Returns:
            True if line looks like an item name
        """
        line_upper = line.upper().strip()
        
        # Skip lines that are clearly price/weight lines
        if re.match(r'^\d+\.?\d*\s*(oz|lb|kg|g)\s*@', line_upper):
            return False
        if re.match(r'^\d+\.\d{2}\s*$', line.strip()):  # Just a price
            return False
        if re.match(r'^\d+\.\d+\s*oz\s*@', line_upper):  # Weight line
            return False
        
        # Skip if it's just metadata
        if any(keyword in line_upper for keyword in ['SUBTOTAL', 'TOTAL', 'TAX1', 'TAX', 'VISA', 'CHANGE']):
            return False
        
        # Item names usually have letters (at least 2 consecutive letters)
        if re.search(r'[A-Z]{2,}', line_upper):
            return True
        
        # Or has product code pattern (12+ digits)
        if re.search(r'\d{12,}', line):
            return True
        
        return False
    
    @staticmethod
    def _is_payment_line(line: str) -> bool:
        """
        Check if line is related to payment (not an item)
        
        Args:
            line: Text line to check
            
        Returns:
            True if line is payment-related
        """
        payment_keywords = [
            'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'CASH', 'CHECK',
            'TEND', 'PAYMENT', 'CHANGE DUE', 'REF #', 'TRANS ID',
            'VALIDATION', 'AID', 'TERMINAL', 'APPR#', 'CREDIT',
            'DEBIT', 'CARD'
        ]
        
        line_upper = line.upper()
        return any(keyword in line_upper for keyword in payment_keywords)
    
    @classmethod
    def _extract_total(cls, text: str) -> Optional[float]:
        """
        Extract total amount from receipt directly from raw text
        
        Args:
            text: Raw receipt text
            
        Returns:
            Total amount if found, None otherwise
        """
        # Handle escaped newlines (handle both \\\\n and \\n)
        text = text.replace('\\\\n', '\n').replace('\\n', '\n')
        text_upper = text.upper()
        
        # Try to extract TOTAL from receipt - try each pattern
        for pattern in cls.TOTAL_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                try:
                    total = float(match.group(1))
                    # Double check: make sure we didn't match "SUBTOTAL"
                    match_start = match.start()
                    # Check 10 characters before the match to see if it's "SUB"
                    context_start = max(0, match_start - 10)
                    context = text_upper[context_start:match_start + 20]
                    if 'SUBTOTAL' not in context or context.rfind('SUBTOTAL') < match_start - context_start:
                        return total
                except (ValueError, IndexError):
                    continue
        
        # Also try a more flexible pattern that matches "TOTAL" followed by any whitespace and number
        # Use word boundary to ensure we don't match "SUBTOTAL"
        flexible_patterns = [
            r'\bTOTAL\s+(\d+\.\d{2})',  # "TOTAL 33.40" - simple pattern with space
        ]
        for pattern in flexible_patterns:
            match = re.search(pattern, text_upper)
            if match:
                try:
                    total = float(match.group(1))
                    return total
                except (ValueError, IndexError):
                    continue
        
        # If not found, return None (don't calculate, just extract what's in the receipt)
        return None
    
    @staticmethod
    def _is_metadata_line(line: str) -> bool:
        """
        Check if line contains metadata (not an item)
        
        Args:
            line: Text line to check
            
        Returns:
            True if line is metadata, False otherwise
        """
        metadata_keywords = [
            'TOTAL', 'SUBTOTAL', 'TAX1', 'TAX', 'AMOUNT', 'BALANCE',
            'THANK YOU', 'CASHIER', 'DATE', 'TIME', 'PHONE',
            'ADDRESS', 'STORE', 'RECEIPT', 'MEMBER', 'CARD',
            'ITEMS SOLD', 'TC#', 'ST#', 'OP#', 'TE#', 'TR#',
            'MGR', 'MANAGER', 'SURVEY', 'FEEDBACK', 'DELIVERY',
            'WALMART+', 'GET FREE'
        ]
        
        line_upper = line.upper()
        # Check if line starts with or contains metadata keywords
        # But allow items that contain these words (e.g., "TAX-FREE ITEM")
        if any(re.match(rf'^{keyword}[\s:]', line_upper) for keyword in ['TOTAL', 'SUBTOTAL', 'TAX1', 'TAX']):
            return True
        if any(keyword in line_upper for keyword in metadata_keywords):
            # But don't mark as metadata if it looks like an item line
            if ReceiptParser._looks_like_item_name(line):
                return False
            return True
        
        return False
    
    @staticmethod
    def _clean_item_name(name: str) -> str:
        """
        Clean up item name by removing special characters, product codes, and metadata
        
        Args:
            name: Raw item name
            
        Returns:
            Cleaned item name
        """
        # Remove product codes (12+ digit numbers)
        name = re.sub(r'\d{12,}', '', name)
        
        # Remove trailing single letters (like "F" in "ROTH CREAMY ... F")
        name = re.sub(r'\s+[A-Z]\s*$', '', name)
        
        # Remove leading special characters and numbers
        name = re.sub(r'^[\d\W]+', '', name)
        
        # Remove trailing special characters
        name = re.sub(r'[\W]+$', '', name)
        
        # Replace multiple spaces with single space
        name = re.sub(r'\s+', ' ', name)
        
        return name.strip()
    
    @staticmethod
    def _extract_quantity(name: str) -> int:
        """
        Extract quantity from item name (e.g., "2 x Apples" -> 2)
        
        Args:
            name: Item name
            
        Returns:
            Quantity (default 1)
        """
        match = re.match(r'^(\d+)\s*[xX×]\s*', name)
        if match:
            return int(match.group(1))
        return 1
    
    @classmethod
    def _extract_subtotal(cls, text: str) -> Optional[float]:
        """
        Extract subtotal amount from receipt directly from raw text
        
        Args:
            text: Raw receipt text
            
        Returns:
            Subtotal amount if found, or calculated as total - tax if not found
        """
        # Handle escaped newlines (handle both \\\\n and \\n)
        text = text.replace('\\\\n', '\n').replace('\\n', '\n')
        text_upper = text.upper()
        
        # Try to extract SUBTOTAL from receipt
        for pattern in cls.SUBTOTAL_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                try:
                    subtotal = float(match.group(1))
                    return subtotal
                except (ValueError, IndexError):
                    continue
        
        # If not found, calculate as total - tax
        total = cls._extract_total(text)
        tax = cls._extract_tax(text)
        
        if total is not None and tax is not None:
            subtotal = total - tax
            if subtotal > 0:
                return round(subtotal, 2)
        
        # If still not found, return None
        return None
    
    @classmethod
    def _extract_tax(cls, text: str) -> Optional[float]:
        """
        Extract tax amount from receipt directly from raw text
        
        Args:
            text: Raw receipt text
            
        Returns:
            Tax amount if found, None otherwise (don't calculate)
        """
        # Handle escaped newlines (handle both \\\\n and \\n)
        text = text.replace('\\\\n', '\n').replace('\\n', '\n')
        text_upper = text.upper()
        
        # Try to extract tax directly from receipt - try each pattern
        for pattern in cls.TAX_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                try:
                    tax = float(match.group(1))
                    return tax
                except (ValueError, IndexError):
                    continue
        
        # If not found, return None (don't calculate, just extract what's in the receipt)
        return None