document.getElementById('addTodoBtn').addEventListener('click', function() {
    var todoInput = document.getElementById('todoInput');
    var todoText = todoInput.value;
    if (todoText) {
        var li = document.createElement('li');
        li.textContent = todoText;
        var deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', function() {
            li.remove();
        });
        li.appendChild(deleteBtn);
        document.getElementById('todoList').appendChild(li);
        todoInput.value = '';
    }
});