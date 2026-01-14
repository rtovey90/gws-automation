/**
 * Template Utilities - Simple variable replacement in templates
 */
class TemplateUtils {
  /**
   * Render template with variables
   * Variables should be in format {{VARIABLE_NAME}}
   */
  render(template, variables) {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value || '');
    }

    return result;
  }

  /**
   * Validate that all required variables are present
   */
  validateVariables(template, variables) {
    const requiredVars = template.match(/{{([^}]+)}}/g) || [];
    const missing = [];

    for (const varMatch of requiredVars) {
      const varName = varMatch.replace(/{{|}}/g, '');
      if (!variables[varName]) {
        missing.push(varName);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

module.exports = new TemplateUtils();
