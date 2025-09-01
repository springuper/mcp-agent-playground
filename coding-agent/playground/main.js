const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let snake = [{ x: 10, y: 10 }];
let direction = { x: 0, y: 0 };
let food = { x: 15, y: 15 };
let gameOver = false;

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'green';
    snake.forEach(segment => {
        ctx.fillRect(segment.x * 20, segment.y * 20, 18, 18);
    });
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x * 20, food.y * 20, 18, 18);
}

function update() {
    if (gameOver) return;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    // Check for wall collisions
    if (head.x < 0 || head.x >= canvas.width / 20 || head.y < 0 || head.y >= canvas.height / 20 || snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        gameOver = true;
        alert('Game Over!');
        return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
        food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
    } else {
        snake.pop();
    }
}

function gameLoop() {
    update();
    draw();
    setTimeout(gameLoop, 100);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') direction = { x: 0, y: -1 };
    if (event.key === 'ArrowDown') direction = { x: 0, y: 1 };
    if (event.key === 'ArrowLeft') direction = { x: -1, y: 0 };
    if (event.key === 'ArrowRight') direction = { x: 1, y: 0 };
});

gameLoop();