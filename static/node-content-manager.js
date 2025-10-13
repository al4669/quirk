// Node content manager for inline editing and content interactions
class NodeContentManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  editNodeType(nodeId) {
    const node = this.wallboard.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const typeElement = document.getElementById(`type-${nodeId}`);
    const currentType = this.wallboard.getNodeTitle(node);

    // Create input field
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentType;
    input.className = "node-type-editor";

    // Replace the type element with input
    typeElement.style.display = "none";
    typeElement.parentNode.insertBefore(input, typeElement);
    input.focus();
    input.select();

    // Handle save/cancel
    const saveEdit = () => {
      if (input.parentNode) {
        const newType = input.value.trim() || currentType;

        // Generate unique title (excluding current node)
        const uniqueTitle = NodeUtils.generateUniqueTitle(newType, this.wallboard.nodes, nodeId);

        // Use new field name "title", remove old "type" if it exists
        node.title = uniqueTitle;
        delete node.type;
        typeElement.textContent = uniqueTitle.toUpperCase();
        typeElement.style.display = "";
        input.remove();
        this.wallboard.autoSave();
      }
    };

    const cancelEdit = () => {
      if (input.parentNode) {
        typeElement.style.display = "";
        input.remove();
      }
    };

    // Handle click outside to close editor
    const handleClickOutside = (e) => {
      if (!input.contains(e.target) && input.parentNode) {
        saveEdit();
        document.removeEventListener("click", handleClickOutside);
      }
    };

    // Add click outside listener after a small delay to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 10);

    input.addEventListener("blur", () => {
      // Small delay to ensure click events are processed first
      setTimeout(() => {
        if (input.parentNode) {
          saveEdit();
        }
      }, 10);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
        document.removeEventListener("click", handleClickOutside);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
        document.removeEventListener("click", handleClickOutside);
      }
      // Prevent event bubbling to avoid conflicts
      e.stopPropagation();
    });

    // Prevent clicks on the input from bubbling up
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  enableCheckboxes(contentElement, node) {
    const checkboxes = contentElement.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox, index) => {
      checkbox.disabled = false;
      checkbox.style.cursor = 'pointer';

      // Add unique data attribute to track this specific checkbox
      checkbox.dataset.checkboxIndex = index;

      // Replace with a new checkbox to remove old event listeners
      const newCheckbox = checkbox.cloneNode(true);
      checkbox.parentNode.replaceChild(newCheckbox, checkbox);

      newCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        // Use the data attribute for the index
        const checkboxIndex = parseInt(newCheckbox.dataset.checkboxIndex);
        this.handleCheckboxToggle(node, checkboxIndex, newCheckbox.checked);
      });
    });
  }

  handleCheckboxToggle(node, checkboxIndex, isChecked) {
    if (!node.data || !node.data.content) return;

    // Play snap sound with variation
    if (typeof soundManager !== 'undefined') {
      soundManager.playSnap();
    }

    const lines = node.data.content.split('\n');
    let currentCheckboxIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match markdown checkbox syntax: - [ ] or - [x] or - [X]
      const checkboxMatch = line.match(/^(\s*[-*+]\s+)\[([ xX])\](.*)$/);

      if (checkboxMatch) {
        if (currentCheckboxIndex === checkboxIndex) {
          // Toggle this checkbox
          const prefix = checkboxMatch[1];
          const suffix = checkboxMatch[3];
          const newCheckState = isChecked ? 'x' : ' ';
          lines[i] = `${prefix}[${newCheckState}]${suffix}`;
          break;
        }
        currentCheckboxIndex++;
      }
    }

    // Update node content
    node.data.content = lines.join('\n');

    // Clear cached HTML to force re-render
    delete node.data.html;

    // Save immediately for checkboxes (don't wait for debounce)
    // Use requestIdleCallback if available, otherwise save immediately
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => this.wallboard.saveCurrentBoard());
    } else {
      this.wallboard.saveCurrentBoard();
    }

    // Don't re-render - the checkbox is already in the correct state
    // Just update the data model silently
  }
}
