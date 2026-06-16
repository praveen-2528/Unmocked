import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, BookOpen, Lightbulb, Zap, HelpCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import './FormulaBook.css';

const formulaData = [
  {
    category: "Number System",
    icon: <Zap size={20} />,
    items: [
      {
        title: "Divisibility Rules",
        content: `• By 2: Last digit is even
• By 3: Sum of digits divisible by 3
• By 4: Last two digits divisible by 4
• By 5: Last digit is 0 or 5
• By 8: Last three digits divisible by 8
• By 9: Sum of digits divisible by 9
• By 11: Difference of sum of digits at odd and even places is 0 or multiple of 11`
      },
      {
        title: "Important Series",
        content: `• Sum of first n numbers: n(n+1)/2
• Sum of squares of first n numbers: n(n+1)(2n+1)/6
• Sum of cubes of first n numbers: [n(n+1)/2]²`
      }
    ]
  },
  {
    category: "Algebra",
    icon: <HelpCircle size={20} />,
    items: [
      {
        title: "Basic Identities",
        content: `• (a+b)² = a² + b² + 2ab
• (a-b)² = a² + b² - 2ab
• (a+b)(a-b) = a² - b²
• (a+b)³ = a³ + b³ + 3ab(a+b)
• (a-b)³ = a³ - b³ - 3ab(a-b)
• a³+b³ = (a+b)(a²-ab+b²)
• a³-b³ = (a-b)(a²+ab+b²)`
      },
      {
        title: "Special Identities",
        content: `• If x + 1/x = a, then x² + 1/x² = a² - 2
• If x - 1/x = a, then x² + 1/x² = a² + 2
• If x + 1/x = a, then x³ + 1/x³ = a³ - 3a
• If x - 1/x = a, then x³ - 1/x³ = a³ + 3a`
      }
    ]
  },
  {
    category: "Geometry",
    icon: <BookOpen size={20} />,
    items: [
      {
        title: "Triangles",
        content: `• Sum of angles = 180°
• Area = 1/2 × base × height
• Area (Heron's Formula) = √[s(s-a)(s-b)(s-c)], where s = (a+b+c)/2
• Equilateral Triangle Area = (√3/4)a²
• Inradius of Equilateral Triangle = a/(2√3)
• Circumradius of Equilateral Triangle = a/√3`
      },
      {
        title: "Circles",
        content: `• Area = πr²
• Circumference = 2πr
• Area of Sector = (θ/360) × πr²
• Length of Arc = (θ/360) × 2πr`
      }
    ]
  },
  {
    category: "Trigonometry",
    icon: <BookOpen size={20} />,
    items: [
      {
        title: "Basic Ratios & Identities",
        content: `• sin²θ + cos²θ = 1
• 1 + tan²θ = sec²θ
• 1 + cot²θ = cosec²θ
• sin(90-θ) = cosθ
• cos(90-θ) = sinθ
• tan(90-θ) = cotθ`
      },
      {
        title: "Value Table",
        content: `• sin(0°)=0, sin(30°)=1/2, sin(45°)=1/√2, sin(60°)=√3/2, sin(90°)=1
• cos(0°)=1, cos(30°)=√3/2, cos(45°)=1/√2, cos(60°)=1/2, cos(90°)=0
• tan(0°)=0, tan(30°)=1/√3, tan(45°)=1, tan(60°)=√3, tan(90°)=∞`
      }
    ]
  },
  {
    category: "Mensuration 3D",
    icon: <BookOpen size={20} />,
    items: [
      {
        title: "Cube & Cuboid",
        content: `Cube:
• Volume = a³
• Total Surface Area = 6a²
• Diagonal = a√3

Cuboid:
• Volume = l × b × h
• Total Surface Area = 2(lb + bh + hl)
• Diagonal = √(l² + b² + h²)`
      },
      {
        title: "Cylinder & Cone",
        content: `Cylinder:
• Volume = πr²h
• Curved Surface Area = 2πrh
• Total Surface Area = 2πr(r+h)

Cone:
• Volume = (1/3)πr²h
• Slant height (l) = √(r² + h²)
• Curved Surface Area = πrl
• Total Surface Area = πr(r+l)`
      },
      {
        title: "Sphere & Hemisphere",
        content: `Sphere:
• Volume = (4/3)πr³
• Surface Area = 4πr²

Hemisphere:
• Volume = (2/3)πr³
• Curved Surface Area = 2πr²
• Total Surface Area = 3πr²`
      }
    ]
  },
  {
    category: "Time, Speed & Distance",
    icon: <BookOpen size={20} />,
    items: [
      {
        title: "Basic Formulas",
        content: `• Distance = Speed × Time
• km/hr to m/s: Multiply by 5/18
• m/s to km/hr: Multiply by 18/5`
      },
      {
        title: "Average Speed",
        content: `• If unequal distances: Total Distance / Total Time
• If two equal distances at speed a and b: (2ab)/(a+b)
• If three equal distances at speed a, b, c: (3abc)/(ab+bc+ca)`
      },
      {
        title: "Relative Speed",
        content: `• Same direction: Speed1 - Speed2
• Opposite direction: Speed1 + Speed2
• Train crossing a pole: Time = (Length of Train) / Speed
• Train crossing a platform: Time = (Length of Train + Platform) / Speed`
      }
    ]
  },
  {
    category: "Profit & Loss",
    icon: <BookOpen size={20} />,
    items: [
      {
        title: "Basic Formulas",
        content: `• Profit = SP - CP
• Loss = CP - SP
• Profit % = (Profit/CP) × 100
• Loss % = (Loss/CP) × 100`
      },
      {
        title: "Marked Price & Discount",
        content: `• Discount = MP - SP
• Discount % = (Discount/MP) × 100
• Successive Discount of a% and b% = (a + b - ab/100)%`
      }
    ]
  },
  {
    category: "Tips & Tricks",
    icon: <Lightbulb size={20} />,
    items: [
      {
        title: "Calculation Shortcuts",
        content: `• Multiplication by 11: Write outer numbers, sum inner numbers (e.g. 52 * 11 = 572).
• Squaring numbers ending in 5: (n)(n+1) prefix, append 25 at the end (e.g. 65² = 6*7 prefix 42, append 25 = 4225).
• Digital Root: Used to verify arithmetic operations. The sum of digits of the question equals sum of digits of the answer.`
      },
      {
        title: "Time & Work Trick",
        content: `• If A does work in x days, and B does it in y days, together they take (xy)/(x+y) days.
• M1D1H1/W1 = M2D2H2/W2 formula rules Time & Work. Keep it handy!`
      },
      {
        title: "Compound Interest Magic",
        content: `• 2 Years: SI and CI difference for 2 years = P(R/100)²
• 3 Years: SI and CI difference for 3 years = P(R/100)²(3 + R/100)`
      }
    ]
  }
];

const FormulaBook = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(formulaData[0].category);

  const filteredCategories = formulaData.map(cat => ({
    ...cat,
    items: cat.items.filter(item => 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0);

  const currentCategoryData = filteredCategories.find(c => c.category === activeCategory) 
    || (filteredCategories.length > 0 ? filteredCategories[0] : null);

  return (
    <div className="formula-container animate-fade-in">
      <div className="formula-header">
        <div className="header-left">
          <Button variant="ghost" onClick={() => navigate(-1)} className="back-btn">
            <ChevronLeft size={20} /> Back
          </Button>
          <div className="title-group">
            <h1>SSC Quant Formula Book</h1>
            <p>Your ultimate compendium of formulas, tips, and tricks.</p>
          </div>
        </div>
        <div className="search-bar glass">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search formulas or topics..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="formula-layout">
        {/* Sidebar */}
        <Card className="formula-sidebar glass">
          <h3 className="sidebar-title">Categories</h3>
          <div className="category-list">
            {filteredCategories.map(cat => (
              <button
                key={cat.category}
                className={`category-btn ${activeCategory === cat.category ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.category)}
              >
                <span className="cat-icon">{cat.icon}</span>
                <span className="cat-text">{cat.category}</span>
                <span className="cat-count">{cat.items.length}</span>
              </button>
            ))}
            {filteredCategories.length === 0 && (
              <div className="empty-state">No categories match your search.</div>
            )}
          </div>
        </Card>

        {/* Content Area */}
        <div className="formula-content-area">
          {currentCategoryData ? (
            <div className="content-cards">
              <div className="category-header">
                <h2>{currentCategoryData.category}</h2>
                <div className="cat-badge">{currentCategoryData.items.length} formulas</div>
              </div>
              <div className="cards-grid">
                {currentCategoryData.items.map((item, idx) => (
                  <Card key={idx} className="formula-card glass">
                    <h3 className="card-title">{item.title}</h3>
                    <pre className="card-content">
                      {item.content}
                    </pre>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card className="empty-content glass">
              <Search size={48} className="text-secondary opacity-50 mb-3" />
              <h3>No formulas found</h3>
              <p>Consider trying different search terms.</p>
              <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormulaBook;
