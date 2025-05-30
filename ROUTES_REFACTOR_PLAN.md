# Routes.py Refactoring Plan

## 🚨 **Current Issue**
- **948 lines** in a single file
- **23 routes** handling multiple concerns
- **Mixed responsibilities**: tasks, chat, file uploads, interaction logging
- **Hard to maintain** and navigate

## 📋 **Suggested Module Split**

### **1. Core API Routes** (`routes.py`)
Keep only essential routes:
- `/health` - Health check
- Root-level endpoints

### **2. Task Management** (`task_routes.py`)
```python
# Routes: 6 endpoints, ~100 lines
- GET    /tasks
- POST   /tasks  
- GET    /tasks/<id>
- PUT    /tasks/<id>
- DELETE /tasks/<id>
```

### **3. Chat System** (`chat_routes.py`)
```python
# Routes: 8 endpoints, ~200 lines  
- GET    /chat_sessions
- POST   /chat_sessions
- DELETE /chat_sessions/<id>
- POST   /chat_sessions/<id>/update_provider
- GET    /chat_sessions/<id>/messages
- POST   /chat_sessions/<id>/messages
- POST   /chat_sessions/<id>/respond_llm
- GET    /chat_sessions/<id>/respond_llm_stream
```

### **4. Media & Uploads** (`media_routes.py`)
```python
# Routes: 2 endpoints, ~100 lines
- POST   /uploads
- GET    /interaction-logs/media/<id>  # Media proxy
```

### **5. Interaction Logging** (`interaction_routes.py`)
```python
# Routes: 7 endpoints, ~500 lines
- POST   /interaction-logs
- GET    /interaction-logs/<session_id>
- GET    /interaction-logs/analytics/<session_id>
- GET    /interaction-logs/sessions
- POST   /interaction-logs/session/<id>/start
- POST   /interaction-logs/session/<id>/end
```

### **6. Legacy/Deprecated** (`legacy_routes.py`)
```python
# Routes that might be unused:
- GET/POST /messages (global messages, not session-specific)
```

## 🔧 **Implementation Steps**

### **Step 1: Create Blueprint Structure**
```
backend/app/api/
├── __init__.py
├── routes.py (slimmed down)
├── task_routes.py
├── chat_routes.py  
├── media_routes.py
├── interaction_routes.py
└── legacy_routes.py
```

### **Step 2: Register Blueprints**
```python
# In __init__.py
from .task_routes import task_bp
from .chat_routes import chat_bp
from .media_routes import media_bp
from .interaction_routes import interaction_bp

def create_api():
    api.register_blueprint(task_bp, url_prefix='/tasks')
    api.register_blueprint(chat_bp, url_prefix='/chat')
    api.register_blueprint(media_bp, url_prefix='/media')
    api.register_blueprint(interaction_bp, url_prefix='/interaction-logs')
```

### **Step 3: Move Helper Functions**
```python
# Create services/helpers.py
- allowed_file()
- _update_session_summary()
- _compute_content_hash()
- Other utility functions
```

## 📊 **Benefits**
- **Maintainability**: Smaller, focused files
- **Team Collaboration**: Reduce merge conflicts
- **Testing**: Easier to test individual modules
- **Performance**: Potential lazy loading
- **Documentation**: Clear separation of concerns

## ⚠️ **Risks & Considerations**
- **Breaking Changes**: URL structure might change
- **Import Complexity**: Need to update imports
- **Testing**: Need to update test files
- **Deployment**: Ensure all modules are included

## 🎯 **Priority**
- **High**: Interaction routes (most complex, actively developed)
- **Medium**: Chat routes (second largest)
- **Low**: Task/Media routes (simpler, stable)

## 📝 **Next Steps**
1. **Complete current commit** (interaction replay improvements)
2. **Create branch** for routes refactoring
3. **Start with interaction_routes.py** (biggest win)
4. **Test thoroughly** before merging
5. **Update documentation** and imports 