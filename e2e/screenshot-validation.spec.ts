import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Screenshot Validation Suite
 *
 * Validates visual integrity and enables before/after comparison workflow.
 *
 * Usage:
 *   # Capture baseline
 *   SCREENSHOT_LABEL=before npm run test:e2e -- screenshot
 *
 *   # Make changes
 *
 *   # Capture after
 *   SCREENSHOT_LABEL=after npm run test:e2e -- screenshot
 *
 *   # Compare visually (file explorer or image viewer)
 *   ls -la e2e/screenshots/before/
 *   ls -la e2e/screenshots/after/
 */

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const LABEL = process.env.SCREENSHOT_LABEL || 'current';
const LABEL_DIR = path.join(SCREENSHOT_DIR, LABEL);

// Ensure screenshot directory exists
if (!fs.existsSync(LABEL_DIR)) {
  fs.mkdirSync(LABEL_DIR, { recursive: true });
}

test.describe('Screenshot validation suite', () => {
  test('Screenshots directory exists and is writable', async () => {
    // Verify directories are set up
    expect(fs.existsSync(SCREENSHOT_DIR)).toBe(true);
    expect(fs.existsSync(LABEL_DIR)).toBe(true);
    
    // Try writing a test file
    const testFile = path.join(LABEL_DIR, '.test-write');
    fs.writeFileSync(testFile, 'test');
    expect(fs.existsSync(testFile)).toBe(true);
    fs.unlinkSync(testFile);
    
    console.log(`✓ Screenshot directory ready: ${LABEL_DIR}`);
  });
  
  test('Screenshot comparison workflow available', async () => {
    // Check if both before and after directories exist
    const beforeDir = path.join(SCREENSHOT_DIR, 'before');
    const afterDir = path.join(SCREENSHOT_DIR, 'after');
    
    const beforeExists = fs.existsSync(beforeDir);
    const afterExists = fs.existsSync(afterDir);
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Screenshot Comparison Info                   ║
╠════════════════════════════════════════════════════════════════╣
║ Current Label: ${LABEL.padEnd(54)} ║
║ Save Directory: ${LABEL_DIR.padEnd(46)} ║
║                                                                  ║
║ Before snapshots exist: ${beforeExists ? 'YES' : 'NO                                          '}║
║ After snapshots exist:  ${afterExists ? 'YES' : 'NO                                          '}║
║                                                                  ║
║ Workflow:                                                        ║
║ 1. SCREENSHOT_LABEL=before npm run test:e2e -- flow-00          ║
║ 2. Make changes / fixes                                          ║
║ 3. SCREENSHOT_LABEL=after npm run test:e2e -- flow-00           ║
║ 4. Compare files:                                                ║
║    open e2e/screenshots/before/                                 ║
║    open e2e/screenshots/after/                                  ║
║                                                                  ║
║ Use an image diff viewer (e.g., Kaleidoscope, Araxis Merge)      ║
║ to spot visual regressions and improvements.                     ║
╚════════════════════════════════════════════════════════════════╝
    `);
  });
  
  test('Screenshot manifest: list all captured images', async () => {
    if (!fs.existsSync(LABEL_DIR)) {
      console.log(`No screenshots yet in ${LABEL_DIR}`);
      return;
    }
    
    const files = fs.readdirSync(LABEL_DIR).filter(f => f.endsWith('.png'));
    
    if (files.length === 0) {
      console.log('No screenshots captured yet');
      return;
    }
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║            Captured Screenshots (Label: ${LABEL.padEnd(47)}) ║
╠════════════════════════════════════════════════════════════════╣
    `);
    
    files.forEach((file, idx) => {
      const filepath = path.join(LABEL_DIR, file);
      const stat = fs.statSync(filepath);
      const sizeKb = (stat.size / 1024).toFixed(1);
      
      console.log(`║ ${(idx + 1).toString().padStart(2)}. ${file.padEnd(46)} ${sizeKb.padStart(8)} KB ║`);
    });
    
    console.log(`║                                                                  ║`);
    console.log(`║ Total: ${files.length} images captured${' '.repeat(45 - files.length.toString().length)}║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝`);
  });
  
  test('Compare before vs after snapshots (if both exist)', async () => {
    const beforeDir = path.join(SCREENSHOT_DIR, 'before');
    const afterDir = path.join(SCREENSHOT_DIR, 'after');
    
    if (!fs.existsSync(beforeDir) || !fs.existsSync(afterDir)) {
      console.log('⚠ Skipping comparison: need both before/ and after/ directories');
      return;
    }
    
    const beforeFiles = fs.readdirSync(beforeDir).filter(f => f.endsWith('.png')).sort();
    const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png')).sort();
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  Before/After Comparison                        ║
╠════════════════════════════════════════════════════════════════╣
    `);
    
    // Show files that exist in both
    const commonFiles = beforeFiles.filter(f => afterFiles.includes(f));
    
    if (commonFiles.length > 0) {
      console.log(`║ Files to compare (${commonFiles.length} pages):${' '.repeat(38 - commonFiles.length.toString().length)}║`);
      commonFiles.forEach(file => {
        const beforePath = path.join(beforeDir, file);
        const afterPath = path.join(afterDir, file);
        
        const beforeSize = fs.statSync(beforePath).size;
        const afterSize = fs.statSync(afterPath).size;
        const sizeDiff = afterSize - beforeSize;
        const sign = sizeDiff > 0 ? '+' : '';
        
        console.log(`║   ${file.padEnd(40)} ${sign}${(sizeDiff / 1024).toFixed(1)} KB${' '.repeat(5)}║`);
      });
    }
    
    // Show files only in before
    const onlyBefore = beforeFiles.filter(f => !afterFiles.includes(f));
    if (onlyBefore.length > 0) {
      console.log(`║                                                                  ║`);
      console.log(`║ Pages removed (${onlyBefore.length}):${' '.repeat(49 - onlyBefore.length.toString().length)}║`);
      onlyBefore.forEach(file => {
        console.log(`║   - ${file.padEnd(57)}║`);
      });
    }
    
    // Show files only in after
    const onlyAfter = afterFiles.filter(f => !beforeFiles.includes(f));
    if (onlyAfter.length > 0) {
      console.log(`║                                                                  ║`);
      console.log(`║ Pages added (${onlyAfter.length}):${' '.repeat(51 - onlyAfter.length.toString().length)}║`);
      onlyAfter.forEach(file => {
        console.log(`║   + ${file.padEnd(57)}║`);
      });
    }
    
    console.log(`╚════════════════════════════════════════════════════════════════╝`);
  });
  
  test('Visual regression detection workflow', async () => {
    console.log(`
Visual Regression Detection Workflow:
────────────────────────────────────

1. ESTABLISH BASELINE (session start):
   SCREENSHOT_LABEL=before npm run test:e2e -- flow-00

2. MAKE CHANGES:
   - Fix tests
   - Update UI
   - Apply styles
   - Etc.

3. CAPTURE AFTER (session end):
   SCREENSHOT_LABEL=after npm run test:e2e -- flow-00

4. REVIEW DIFFERENCES:
   a) Quick diff (file size): larger = more content/styling
   b) Visual diff tool: use Kaleidoscope, Araxis, or online ImageDiff
   c) Screenshot path: ${path.join('e2e/screenshots/before|after', '*.png')}

5. INTERPRET RESULTS:
   ✓ Expected changes: layout improvements, color updates, etc.
   ✗ Regressions: missing content, broken alignment, NaN values
   ⚠️ Questionable: new visual artifacts, unexpected spacing

6. DOCUMENT IN HANDOFF:
   Note in docs/handovers/session-*.md which pages changed and why.

Example: Using macOS open or VS Code:
  open e2e/screenshots/before/
  open e2e/screenshots/after/
  # Drag windows side-by-side and compare page by page

Pro Tip: Use "Differences" Spotlight search or diff tools:
  diff <(ls e2e/screenshots/before/) <(ls e2e/screenshots/after/)
    `);
  });
});

test.describe('Screenshot quality checks', () => {
  test('All saved screenshots are valid PNG files', async () => {
    if (!fs.existsSync(LABEL_DIR)) {
      console.log('No screenshots to validate');
      return;
    }
    
    const pngFiles = fs.readdirSync(LABEL_DIR).filter(f => f.endsWith('.png'));
    
    pngFiles.forEach(file => {
      const filepath = path.join(LABEL_DIR, file);
      const buffer = fs.readFileSync(filepath);
      
      // PNG magic number: 89 50 4E 47
      const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && 
                    buffer[2] === 0x4E && buffer[3] === 0x47;
      
      expect(isPNG).toBe(true);
    });
    
    console.log(`✓ All ${pngFiles.length} PNG files valid`);
  });
  
  test('Screenshots are not corrupted (file size > 1KB)', async () => {
    if (!fs.existsSync(LABEL_DIR)) {
      console.log('No screenshots to validate');
      return;
    }
    
    const pngFiles = fs.readdirSync(LABEL_DIR).filter(f => f.endsWith('.png'));
    
    pngFiles.forEach(file => {
      const filepath = path.join(LABEL_DIR, file);
      const size = fs.statSync(filepath).size;
      
      // Valid screenshots should be at least 1KB
      expect(size).toBeGreaterThan(1024);
    });
  });
});
