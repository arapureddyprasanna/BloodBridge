import { Link } from "react-router-dom";
import "./LandingPage.css";

const stats = [
    ["25,000+", "Lives Impacted"],
    ["18,500+", "Registered Donors"],
    ["350+", "Partner Hospitals"],
    ["120+", "Communities"],
];

const steps = [
    ["01", "Create an Account", "Join BloodBridge as a donor, hospital, or community."],
    ["02", "Find a Match", "Connect through blood type, availability, and distance."],
    ["03", "Make an Impact", "Coordinate donations and help patients receive blood."],
];

const roles = [
    ["Donors", "Be there when someone needs you.", "Become a Donor", "/register"],
    ["Hospitals", "Find compatible donors for urgent blood needs.", "Register Hospital", "/register"],
    ["Communities", "Bring donors together and strengthen your network.", "Build Community", "/register"],
];

function LandingPage() {
    return (
        <main className="landing">
            <header className="lp-header">
                <Link to="/" className="lp-logo">
                    <span className="lp-drop">♥</span> BloodBridge
                </Link>
                <nav className="lp-nav">
                    <a href="#how-it-works">How It Works</a>
                    <a href="#impact">Our Impact</a>
                    <a href="#roles">Get Involved</a>
                </nav>
                <div className="lp-auth">
                    <Link to="/login" className="lp-login">Log In</Link>
                    <Link to="/register" className="lp-btn">Join BloodBridge</Link>
                </div>
            </header>

            <section className="lp-hero">
                <div className="lp-hero-copy">
                    <span className="lp-eyebrow">GIVE BLOOD. GIVE HOPE.</span>
                    <h1>Every Drop<br />Connects a <em>Life.</em></h1>
                    <p>A trusted community-driven blood donation platform connecting donors, hospitals, and communities when every moment matters.</p>
                    <div className="lp-actions">
                        <Link to="/register" className="lp-btn">Become a Donor <span>↗</span></Link>
                        <a href="#how-it-works" className="lp-outline">Discover Our Mission</a>
                    </div>
                    <div className="lp-note"><span>♥</span> One donation can help save lives.</div>
                </div>
                <div className="lp-hero-image">
                    <img
                        src="https://cdn.cogecolive.com/prod-20240510/audio_1715373400885329_ori.jpeg"
                        alt="Healthcare professional assisting a blood donor"
                    />
                    <div className="lp-image-tag"><span>♥</span><div><strong>Every donor matters</strong><small>Be someone's reason to hope</small></div></div>
                </div>
            </section>

            <section className="lp-stats" id="impact">
                {stats.map(([number, label]) => (
                    <div className="lp-stat" key={label}>
                        <strong>{number}</strong><span>{label}</span>
                    </div>
                ))}
            </section>

            <section className="lp-section lp-how" id="how-it-works">
                <div className="lp-heading">
                    <span className="lp-eyebrow">SIMPLE. HUMAN. MEANINGFUL.</span>
                    <h2>Small Steps. <em>Life-Changing</em> Impact.</h2>
                    <p>Making blood donation coordination simpler, safer, and more connected.</p>
                </div>
                <div className="lp-step-grid">
                    {steps.map(([number, title, description]) => (
                        <article className="lp-step" key={number}>
                            <span className="lp-step-number">{number}</span>
                            <h3>{title}</h3><p>{description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="lp-human">
                <div className="lp-human-image">
                    <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1000&q=85" alt="Healthcare team caring for patients" />
                </div>
                <div className="lp-human-copy">
                    <span className="lp-eyebrow">MORE THAN A DONATION</span>
                    <h2>Behind Every Request Is a <em>Human Life.</em></h2>
                    <p>Finding the right blood donor shouldn't feel impossible. BloodBridge brings people together through trusted communities, verified hospitals, and thoughtful matching.</p>
                    <p>Because when people connect, hope travels further.</p>
                    <Link to="/register" className="lp-text-link">Be Part of the Change ↗</Link>
                </div>
            </section>

            <section className="lp-section lp-roles" id="roles">
                <div className="lp-heading">
                    <span className="lp-eyebrow">YOUR ROLE CAN SAVE A LIFE</span>
                    <h2>Together, We Make a <em>Difference.</em></h2>
                    <p>There is a place for everyone in a stronger blood donation network.</p>
                </div>
                <div className="lp-role-grid">
                    {roles.map(([title, description, action, path]) => (
                        <article className="lp-role" key={title}>
                            <span className="lp-role-icon">{title === "Donors" ? "♥" : title === "Hospitals" ? "+" : "◎"}</span>
                            <h3>{title}</h3><p>{description}</p>
                            <Link to={path}>{action} <span>↗</span></Link>
                        </article>
                    ))}
                </div>
            </section>

            <section className="lp-trust">
                <div><span className="lp-eyebrow">BUILT ON TRUST</span><h2>Care That Connects.<br /><em>Trust That Protects.</em></h2></div>
                <div className="lp-trust-item"><span>✓</span><div><h3>Verified Partners</h3><p>Hospitals and communities go through an approval process.</p></div></div>
                <div className="lp-trust-item"><span>◇</span><div><h3>Privacy First</h3><p>Personal contact details are shared only with proper authorization.</p></div></div>
                <div className="lp-trust-item"><span>♡</span><div><h3>Meaningful Matches</h3><p>Connect based on blood type, availability, and distance.</p></div></div>
            </section>

            <section className="lp-cta">
                <span className="lp-eyebrow">BE SOMEONE'S HOPE</span>
                <h2>One Community.<br />Countless <em>Possibilities.</em></h2>
                <p>Join a network where a little kindness can make a lasting difference.</p>
                <Link to="/register" className="lp-cta-btn">Join BloodBridge <span>↗</span></Link>
            </section>

            <footer className="lp-footer">
                <div className="lp-footer-main">
                    <div className="lp-footer-brand"><Link to="/" className="lp-logo"><span className="lp-drop">♥</span> BloodBridge</Link><p>Connecting donors, hospitals, and communities to bring hope closer to those who need it.</p></div>
                    <div><h4>Explore</h4><a href="#how-it-works">How It Works</a><a href="#impact">Our Impact</a><a href="#roles">Get Involved</a></div>
                    <div><h4>Get Started</h4><Link to="/register">Join BloodBridge</Link><Link to="/login">Log In</Link></div>
                </div>
                <div className="lp-footer-bottom"><span>© {new Date().getFullYear()} BloodBridge</span><span>Built with care. Connected by hope. ♥</span></div>
            </footer>
        </main>
    );
}

export default LandingPage;
