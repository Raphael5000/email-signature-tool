import React, { useState, useRef, useEffect } from 'react'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from '../components/navigation-menu'
import { Button } from '../components/button'
import { Textarea } from '../components/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '../components/card'
import { Label } from '../components/label'
import { Menu, X } from 'lucide-react'
import { Toaster } from '../components/sonner'
import { toast } from 'sonner'

function App() {
  const [signatureHtml, setSignatureHtml] = useState('')
  const [detectedFields, setDetectedFields] = useState([])
  const [originalHtml, setOriginalHtml] = useState('')
  const [outputHtml, setOutputHtml] = useState('')
  const [detectStatus, setDetectStatus] = useState('')
  const [noFieldsMsg, setNoFieldsMsg] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [isGenerateDisabled, setIsGenerateDisabled] = useState(true)
  const [isCopyDisabled, setIsCopyDisabled] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const previewFrameRef = useRef(null)

  const resetUI = () => {
    setDetectedFields([])
    setDetectStatus('')
    setOutputHtml('')
    setNoFieldsMsg('')
    setFieldValues({})
    setIsGenerateDisabled(true)
    setIsCopyDisabled(true)
    updatePreview('')
  }

  const handleClear = () => {
    setSignatureHtml('')
    resetUI()
  }

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  const getTextNodes = (node) => {
    const textNodes = []
    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        textNodes.push(n)
      } else {
        n.childNodes.forEach(walk)
      }
    }
    walk(node)
    return textNodes
  }

  const detectFieldsFromHtml = (html) => {
    const fields = []
    const seen = new Set()

    // Helper to add field if not duplicate
    const addField = (key, label, originalValue, suggestedValue = null) => {
      if (!originalValue || originalValue.trim().length === 0) return
      const uniqueKey = `${label}::${originalValue}`
      if (seen.has(uniqueKey)) return
      seen.add(uniqueKey)
      fields.push({
        key: key || `field_${fields.length}`,
        label,
        originalValue: originalValue.trim(),
        suggestedValue: suggestedValue !== null ? suggestedValue : originalValue.trim(),
        enabled: true // New property to allow users to toggle fields
      })
    }

    // Parse HTML
    const wrapperHtml = "<div>" + html + "</div>"
    let doc
    try {
      const parser = new DOMParser()
      doc = parser.parseFromString(wrapperHtml, "text/html")
    } catch (e) {
      doc = null
    }

    // 1) Extract all links/URLs (over-detect)
    const urlRegex = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi
    const urlMatches = html.match(urlRegex) || []
    urlMatches.forEach((url, index) => {
      addField(`link_${index}`, `Link ${index + 1}`, url)
    })

    // Also extract href attributes from anchor tags
    if (doc) {
      const links = doc.querySelectorAll('a[href]')
      links.forEach((link, index) => {
        const href = link.getAttribute('href')
        if (href && (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:'))) {
          const linkText = link.textContent.trim() || href
          addField(`link_href_${index}`, `Link: ${linkText.substring(0, 30)}`, href)
        }
      })
    }

    // 2) Email addresses (all instances)
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    const emailMatches = html.match(emailRegex) || []
    emailMatches.forEach((email, index) => {
      addField(`email_${index}`, index === 0 ? "Email" : `Email ${index + 1}`, email)
    })

    // 3) Phone numbers (all instances)
    const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/g
    const phoneMatches = html.match(phoneRegex) || []
    phoneMatches.forEach((phone, index) => {
      const cleaned = phone.trim()
      addField(`phone_${index}`, index === 0 ? "Phone" : `Phone ${index + 1}`, cleaned)
    })

    // 4) Parse text nodes from HTML
    let textNodes = []
    if (doc) {
      textNodes = getTextNodes(doc.body)
        .map((n) => n.nodeValue.trim())
        .filter((t) => t.length > 0)
    } else {
      // Fallback: simple split on tags
      textNodes = html
        .replace(/<[^>]+>/g, " ")
        .split(/\s{2,}/)
        .map((t) => t.trim())
        .filter((t) => t)
    }

    // 5) Look for common label patterns (Name, Title, Position, etc.)
    const labelPatterns = [
      { pattern: /(?:name|full\s*name|your\s*name)[\s:]*([^\n<]+)/i, label: "Name", key: "name" },
      { pattern: /(?:title|job\s*title|position|role)[\s:]*([^\n<]+)/i, label: "Title", key: "title" },
      { pattern: /(?:position|job\s*position)[\s:]*([^\n<]+)/i, label: "Position", key: "position" },
      { pattern: /(?:company|organization|org)[\s:]*([^\n<]+)/i, label: "Company", key: "company" },
      { pattern: /(?:department|dept)[\s:]*([^\n<]+)/i, label: "Department", key: "department" },
      { pattern: /(?:address|location)[\s:]*([^\n<]+)/i, label: "Address", key: "address" },
      { pattern: /(?:website|web|site)[\s:]*([^\n<]+)/i, label: "Website", key: "website" },
    ]

    labelPatterns.forEach(({ pattern, label, key }) => {
      const matches = html.match(pattern)
      if (matches && matches[1]) {
        const value = matches[1].trim()
        if (value && value.length > 0) {
          addField(key, label, value)
        }
      }
    })

    // 6) Check for common placeholders
    const placeholders = [
      { pattern: /full\s*name/i, label: "Full name", key: "fullName" },
      { pattern: /this\s*is\s*a\s*title/i, label: "Job title", key: "title" },
      { pattern: /your\s*name/i, label: "Name", key: "name" },
      { pattern: /your\s*title/i, label: "Title", key: "title" },
      { pattern: /your\s*position/i, label: "Position", key: "position" },
      { pattern: /company\s*name/i, label: "Company", key: "company" },
    ]

    placeholders.forEach(({ pattern, label, key }) => {
      if (pattern.test(html)) {
        const match = html.match(new RegExp(pattern.source, 'i'))
        if (match) {
          addField(key, label, match[0], "")
        }
      }
    })

    // 7) Extract meaningful text nodes (over-detect)
    const emailRegex2 = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    const phoneRegex2 = /\+?\d[\d\s().-]{7,}\d/
    const urlRegex2 = /https?:\/\/|www\./i

    const cleaned = textNodes.filter((t) => {
      // Filter out emails, phones, URLs, and very short text
      if (t.length < 2) return false
      if (emailRegex2.test(t)) return false
      if (phoneRegex2.test(t)) return false
      if (urlRegex2.test(t)) return false
      // Filter out common HTML artifacts
      if (/^[\s\-_|•]+$/.test(t)) return false
      return true
    })

    // Add first few meaningful text nodes as potential fields
    // Prioritize longer text (likely names/titles)
    const sortedByLength = [...cleaned].sort((a, b) => b.length - a.length)
    const topTextNodes = sortedByLength.slice(0, 10) // Take top 10 longest

    topTextNodes.forEach((text, index) => {
      // Skip if already detected as a specific field
      const alreadyDetected = fields.some(f => f.originalValue === text)
      if (!alreadyDetected) {
        // Try to infer label based on position and content
        let label = "Text content"
        if (index === 0 && text.length > 3 && !fields.some(f => f.key === "name" || f.key === "fullName")) {
          label = "Name (detected)"
        } else if (index === 1 && text.length > 3 && !fields.some(f => f.key === "title" || f.key === "position")) {
          label = "Title (detected)"
        } else {
          label = `Text ${index + 1}`
        }
        addField(`text_${index}`, label, text)
      }
    })

    // 8) Also check for text that looks like names (capitalized words)
    cleaned.forEach((text, index) => {
      if (text.length >= 3 && text.length <= 50) {
        // Check if it looks like a name (starts with capital, has letters)
        if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text)) {
          const alreadyDetected = fields.some(f => f.originalValue === text)
          if (!alreadyDetected && !fields.some(f => f.key === "name" || f.key === "fullName")) {
            addField("name_detected", "Name (detected)", text)
          }
        }
      }
    })

    // Sort fields: prioritize specific fields (email, phone, name, title) first
    const priorityOrder = ['email', 'phone', 'name', 'fullName', 'title', 'position', 'company']
    fields.sort((a, b) => {
      const aPriority = priorityOrder.findIndex(p => a.key.startsWith(p))
      const bPriority = priorityOrder.findIndex(p => b.key.startsWith(p))
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
      if (aPriority !== -1) return -1
      if (bPriority !== -1) return 1
      return 0
    })

    return fields
  }

  const handleDetect = () => {
    const html = signatureHtml.trim()
    resetUI()

    if (!html) {
      setDetectStatus("<strong>Nothing to scan.</strong> Paste your signature HTML first.")
      return
    }

    setOriginalHtml(html)
    const fields = detectFieldsFromHtml(html)
    setDetectedFields(fields)
    
    // Initialize field values
    const initialValues = {}
    fields.forEach(field => {
      initialValues[field.key] = field.suggestedValue || field.originalValue || ""
    })
    setFieldValues(initialValues)

    if (fields.length === 0) {
      setDetectStatus("<strong>No obvious fields found.</strong> You can still manually replace values later by editing the HTML.")
      setNoFieldsMsg("Tip: Use clear placeholder text like 'Full name', 'Job title', etc. for easier detection.")
    } else {
      setDetectStatus(`<strong>Found ${fields.length} potential field(s).</strong> Toggle fields on/off and edit values below, then click Generate.`)
      setIsGenerateDisabled(false)
    }
  }

  const handleFieldChange = (key, value) => {
    setFieldValues(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleFieldToggle = (key) => {
    setDetectedFields(prev => 
      prev.map(field => 
        field.key === key 
          ? { ...field, enabled: !field.enabled }
          : field
      )
    )
  }

  const handleGenerate = () => {
    if (!originalHtml) return

    let updatedHtml = originalHtml

    // Replace only enabled field values
    // Sort by length (longest first) to avoid partial replacements
    const enabledFields = detectedFields
      .filter(field => field.enabled !== false)
      .sort((a, b) => (b.originalValue?.length || 0) - (a.originalValue?.length || 0))

    enabledFields.forEach((field) => {
      const newValue = fieldValues[field.key] || field.originalValue
      if (!field.originalValue) return
      
      // Use simple string replacement for exact matches
      // This handles HTML entities and special characters naturally
      updatedHtml = updatedHtml.split(field.originalValue).join(newValue)
    })

    setOutputHtml(updatedHtml)
    setIsCopyDisabled(!updatedHtml.trim())
    updatePreview(updatedHtml)
  }

  const handleCopy = async () => {
    if (!outputHtml) return

    const html = outputHtml

    // Try to use Clipboard API with text/html for rich paste
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const blob = new Blob([html], { type: "text/html" })
        const data = [new ClipboardItem({ "text/html": blob })]
        await navigator.clipboard.write(data)
        toast.success("Signature Copied", {
          description: "Paste it into your email client"
        })
        return
      } catch (err) {
        console.warn("Rich clipboard failed, falling back to text-only copy.", err)
      }
    }

    // Fallback: select the textarea and copy as text
    const textarea = document.getElementById("outputHtml")
    if (textarea) {
      textarea.focus()
      textarea.select()
      try {
        document.execCommand("copy")
        toast.success("Signature Copied", {
          description: "Paste it into your email client"
        })
      } catch (err) {
        console.error("Copy failed", err)
      } finally {
        window.getSelection().removeAllRanges()
      }
    }
  }

  const updatePreview = (html) => {
    if (!previewFrameRef.current) return
    
    const doc = previewFrameRef.current.contentDocument || previewFrameRef.current.contentWindow.document
    doc.open()
    if (!html) {
      doc.write("<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:system-ui; font-size:12px; color:#9ca3af; display:flex; align-items:center; justify-content:center; height:120px;'>Signature preview will appear here after you generate it.</body></html>")
    } else {
      doc.write(
        "<!doctype html><html><head><meta charset='utf-8'></head><body>" +
        html +
        "</body></html>"
      )
    }
    doc.close()

    // Adjust iframe height to content (roughly)
    setTimeout(() => {
      try {
        const body = doc.body
        const height = body.scrollHeight || 150
        previewFrameRef.current.style.height = Math.min(Math.max(height, 150), 400) + "px"
      } catch (e) {
        // ignore
      }
    }, 50)
  }

  useEffect(() => {
    updatePreview("")
  }, [])

  return (
    <div className="min-h-screen text-gray-900" style={{ backgroundColor: '#F7FAF9' }}>
      <header className="relative flex h-[68px] items-center justify-between px-6 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <img 
            className="h-9 w-auto" 
            src="https://cdn.prod.website-files.com/6826f1bc2fc92556aa2497cc/69392412e6b34a38bb174dc6_Signature%20Tool%20Logo.png" 
            alt="Signature Tool logo" 
          />
        </div>
        
        {/* Desktop Navigation */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink 
                href="#" 
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
              >
                Editor
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                href="#" 
                disabled
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
                style={{ opacity: 0.5 }}
              >
                Generator
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                href="#" 
                disabled
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
                style={{ opacity: 0.5 }}
              >
                Inspiration
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Mobile Hamburger Button */}
        <button
          className="md:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg md:hidden z-50">
            <nav className="flex flex-col py-2">
              <a
                href="#"
                className="px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Editor
              </a>
              <a
                href="#"
                className="px-6 py-3 text-sm font-medium text-gray-500 opacity-50 cursor-not-allowed"
                onClick={(e) => e.preventDefault()}
              >
                Generator
              </a>
              <a
                href="#"
                className="px-6 py-3 text-sm font-medium text-gray-500 opacity-50 cursor-not-allowed"
                onClick={(e) => e.preventDefault()}
              >
                Inspiration
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Main Heading */}
        <div className="text-center mb-12">
          <h1 className="hivory-h1 mb-4">Create and edit your email signatures</h1>
          <p className="hivory-paragraph-medium text-gray-600">
            Paste your HTML email signature below to detect and edit fields
          </p>
        </div>

        {/* Step 1: Paste your HTML signature */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-semibold text-sm mt-1">
              1
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="hivory-h5 mb-4">Paste your HTML email signature</h2>
              <Textarea 
                id="signatureInput"
                value={signatureHtml}
                onChange={(e) => setSignatureHtml(e.target.value)}
                className="w-full min-h-[160px] font-mono text-sm resize-y" 
                placeholder="Paste your HTML email signature here..."
              />
              <div className="flex flex-wrap gap-2 mt-4">
                <Button 
                  onClick={handleDetect}
                  className="rounded-full"
                >
                  Find fields
                </Button>
                <Button 
                  onClick={handleClear}
                  variant="outline"
                  className="rounded-full"
                  type="button"
                >
                  Clear
                </Button>
              </div>
              {detectStatus && (
                <div 
                  className="hivory-paragraph-small text-gray-500 mt-3"
                  dangerouslySetInnerHTML={{ __html: detectStatus }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Edit the detected fields */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-semibold text-sm mt-1">
              2
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="hivory-h5">Edit the detected fields</h2>
                {detectedFields.length > 0 && (
                  <span className="inline-block text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold uppercase tracking-[0.03em]">
                    Auto-detected
                  </span>
                )}
              </div>
              {detectedFields.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 mb-3">
                    Toggle fields on/off to control which ones will be replaced. Unchecked fields will be left unchanged.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {detectedFields.map((field) => (
                      <div 
                        key={field.key} 
                        className={`space-y-2 p-3 rounded-md border ${
                          field.enabled 
                            ? 'border-gray-300 bg-white' 
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.enabled !== false}
                            onChange={() => handleFieldToggle(field.key)}
                            className="w-4 h-4 text-black border-gray-300 rounded focus:ring-2 focus:ring-black"
                            id={`field-${field.key}`}
                          />
                          <Label 
                            htmlFor={`field-${field.key}`}
                            className={`text-sm font-medium ${
                              field.enabled ? 'text-gray-700' : 'text-gray-500'
                            } cursor-pointer`}
                          >
                            {field.label}
                          </Label>
                        </div>
                        <input 
                          type="text" 
                          value={fieldValues[field.key] || ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          disabled={!field.enabled}
                          className={`w-full text-sm px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-black focus:border-black ${
                            field.enabled 
                              ? 'border-gray-300 bg-white' 
                              : 'border-gray-200 bg-gray-100 cursor-not-allowed'
                          }`}
                        />
                        <small className="block text-xs text-gray-500">
                          Original: <code className="font-mono">{escapeHtml(field.originalValue || "")}</code>
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="hivory-paragraph-small text-gray-500">
                    {noFieldsMsg || "No fields detected yet. Paste your HTML signature and click 'Find fields'."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Generate and preview updated signature */}
        <div>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-semibold text-sm mt-1">
              3
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="hivory-h5 mb-4">Generate and preview updated signature</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                <Button 
                  onClick={handleGenerate}
                  disabled={isGenerateDisabled}
                  className="rounded-full"
                >
                  Generate
                </Button>
                <Button 
                  onClick={handleCopy}
                  disabled={isCopyDisabled}
                  variant="outline"
                  className="rounded-full"
                  type="button"
                >
                  Copy signature
                </Button>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">Preview</Label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <iframe 
                    ref={previewFrameRef}
                    title="Signature preview" 
                    className="w-full border-0 bg-white min-h-[150px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-center" style={{ color: '#6B7C75' }}>
            Copyright © 2026 - All rights reserved | A product by{' '}
            <a 
              href="https://www.hivory.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: '#6B7C75' }}
            >
              Hivory
            </a>
          </p>
        </div>
      </footer>
      <Toaster />
    </div>
  )
}

export default App
