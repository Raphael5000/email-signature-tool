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

    // 1) Email
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    const emailMatch = html.match(emailRegex)
    if (emailMatch) {
      fields.push({
        key: "email",
        label: "Email",
        originalValue: emailMatch[0],
        suggestedValue: emailMatch[0]
      })
    }

    // 2) Phone number (very loose pattern)
    const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/
    const phoneMatch = html.match(phoneRegex)
    if (phoneMatch) {
      fields.push({
        key: "phone",
        label: "Phone",
        originalValue: phoneMatch[0].trim(),
        suggestedValue: phoneMatch[0].trim()
      })
    }

    // 3) Parse as HTML to get text nodes
    const wrapperHtml = "<div>" + html + "</div>"
    let textNodes = []
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(wrapperHtml, "text/html")
      textNodes = getTextNodes(doc.body)
        .map((n) => n.nodeValue.trim())
        .filter((t) => t.length > 0)
    } catch (e) {
      // Fallback: simple split on tags
      textNodes = html
        .replace(/<[^>]+>/g, " ")
        .split(/\s{2,}/)
        .map((t) => t.trim())
        .filter((t) => t)
    }

    // Remove email & phone from text candidates
    const cleaned = textNodes.filter((t) => {
      return !emailRegex.test(t) && !phoneRegex.test(t)
    })

    // If placeholders exist, prioritise those
    const PLACEHOLDER_NAME = "Full name"
    const PLACEHOLDER_TITLE = "This is a title"

    if (html.includes(PLACEHOLDER_NAME)) {
      fields.push({
        key: "fullName",
        label: "Full name",
        originalValue: PLACEHOLDER_NAME,
        suggestedValue: ""
      })
    }

    if (html.includes(PLACEHOLDER_TITLE)) {
      fields.push({
        key: "title",
        label: "Job title",
        originalValue: PLACEHOLDER_TITLE,
        suggestedValue: ""
      })
    }

    // Fallback: first 1–2 non-empty text nodes as name/title
    if (!fields.some((f) => f.key === "fullName") && cleaned[0]) {
      fields.push({
        key: "fullName",
        label: "Full name",
        originalValue: cleaned[0],
        suggestedValue: cleaned[0]
      })
    }
    if (!fields.some((f) => f.key === "title") && cleaned[1]) {
      fields.push({
        key: "title",
        label: "Job title",
        originalValue: cleaned[1],
        suggestedValue: cleaned[1]
      })
    }

    // Deduplicate by originalValue
    const seen = new Set()
    return fields.filter((f) => {
      if (!f.originalValue) return false
      const key = f.label + "::" + f.originalValue
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
      setDetectStatus(`<strong>Found ${fields.length} field(s).</strong> Edit the values below, then click Generate.`)
      setIsGenerateDisabled(false)
    }
  }

  const handleFieldChange = (key, value) => {
    setFieldValues(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleGenerate = () => {
    if (!originalHtml) return

    let updatedHtml = originalHtml

    // Replace field values
    detectedFields.forEach((field) => {
      const newValue = fieldValues[field.key] || field.originalValue
      if (!field.originalValue) return
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {detectedFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label className="block text-sm font-medium text-gray-700">{field.label}</Label>
                      <input 
                        type="text" 
                        value={fieldValues[field.key] || ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black focus:border-black" 
                      />
                      <small className="block text-xs text-gray-500">
                        Original: <code className="font-mono">{escapeHtml(field.originalValue || "")}</code>
                      </small>
                    </div>
                  ))}
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
